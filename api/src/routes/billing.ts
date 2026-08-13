import { json, errorResponse } from '../lib/db';
import { createCheckoutSession, verifyStripeSignature, Tier, Interval } from '../lib/stripe';
import type { Env } from './organizations';

const VALID_TIERS: Tier[] = ['plus', 'community', 'corporate'];
const VALID_INTERVALS: Interval[] = ['month', 'year'];

/** Org-scoped, requires the org's API key. Body: { tier: 'plus'|'community'|'corporate', interval?: 'month'|'year' }. */
export async function createCheckout(orgId: string, org: any, request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return errorResponse('billing is not configured yet', 500);

  const body = await request.json<{ tier?: string; interval?: string }>().catch(() => null);
  const tier = body?.tier as Tier;
  const interval = (body?.interval as Interval) || 'month';
  if (!tier || !VALID_TIERS.includes(tier)) {
    return errorResponse(`tier must be one of: ${VALID_TIERS.join(', ')}`);
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return errorResponse(`interval must be one of: ${VALID_INTERVALS.join(', ')}`);
  }

  const siteOrigin = 'https://www.brew-buddies.com';

  const result = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
    orgId,
    tier,
    interval,
    successUrl: `${siteOrigin}/manage.html?org=${orgId}&key=${org.api_key}&upgraded=1`,
    cancelUrl: `${siteOrigin}/manage.html?org=${orgId}&key=${org.api_key}`,
  });

  if ('error' in result) return errorResponse(result.error, 502);
  return json({ checkout_url: result.url });
}

/**
 * Org-scoped, requires the org's API key. Opens Stripe's hosted Customer
 * Portal so the org can update its payment method, view invoices, or
 * cancel — self-service, without needing to email support.
 */
export async function createBillingPortalSession(orgId: string, org: any, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return errorResponse('billing is not configured yet', 500);
  if (!org.stripe_customer_id) {
    return errorResponse('this organization has no billing account yet — upgrade first', 400);
  }

  const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: org.stripe_customer_id,
      return_url: `https://www.brew-buddies.com/manage.html?org=${orgId}&key=${org.api_key}`,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return errorResponse(`Stripe ${res.status}: ${errBody}`, 502);
  }
  const session = (await res.json()) as { url: string };
  return json({ portal_url: session.url });
}

/** Stripe webhook receiver — no auth beyond the signature check. */
export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) return errorResponse('webhook not configured', 500);

  const rawBody = await request.text();
  const signature = request.headers.get('Stripe-Signature');
  const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return errorResponse('invalid signature', 400);

  const event = JSON.parse(rawBody) as { type: string; data: { object: any } };
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const orgId = obj.client_reference_id;
    const customerId = obj.customer;
    const subscriptionId = obj.subscription;
    if (orgId) {
      await env.DB.prepare(
        `UPDATE organizations SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?`
      )
        .bind(customerId ?? null, subscriptionId ?? null, orgId)
        .run();
    }
  } else if (event.type === 'customer.subscription.updated') {
    // Covers renewals, reactivations, and lapses alike: a subscription that
    // goes past_due/unpaid (failed card, etc.) or incomplete_expired drops
    // the org back to free rather than staying on a paid tier for free.
    const orgId = obj.metadata?.organization_id;
    const tier = obj.metadata?.tier;
    const active = obj.status === 'active' || obj.status === 'trialing';
    if (orgId) {
      const newTier = active && tier ? tier : 'free';
      await env.DB.prepare(`UPDATE organizations SET plan_tier = ? WHERE id = ?`).bind(newTier, orgId).run();
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const orgId = obj.metadata?.organization_id;
    if (orgId) {
      await env.DB.prepare(`UPDATE organizations SET plan_tier = 'free' WHERE id = ?`).bind(orgId).run();
    }
  }

  return json({ received: true });
}
