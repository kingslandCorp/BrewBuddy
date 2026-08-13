import { json, errorResponse } from '../lib/db';
import { createCheckoutSession, verifyStripeSignature, Tier } from '../lib/stripe';
import type { Env } from './organizations';

const VALID_TIERS: Tier[] = ['plus', 'community', 'corporate'];

/** Org-scoped, requires the org's API key. Body: { tier: 'plus'|'community'|'corporate' }. */
export async function createCheckout(orgId: string, org: any, request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return errorResponse('billing is not configured yet', 500);

  const body = await request.json<{ tier?: string }>().catch(() => null);
  const tier = body?.tier as Tier;
  if (!tier || !VALID_TIERS.includes(tier)) {
    return errorResponse(`tier must be one of: ${VALID_TIERS.join(', ')}`);
  }

  const siteOrigin = 'https://www.brew-buddies.com';

  const result = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
    orgId,
    tier,
    successUrl: `${siteOrigin}/manage.html?org=${orgId}&key=${org.api_key}&upgraded=1`,
    cancelUrl: `${siteOrigin}/manage.html?org=${orgId}&key=${org.api_key}`,
  });

  if ('error' in result) return errorResponse(result.error, 502);
  return json({ checkout_url: result.url });
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
    const orgId = obj.metadata?.organization_id;
    const tier = obj.metadata?.tier;
    const active = obj.status === 'active' || obj.status === 'trialing';
    if (orgId && tier && active) {
      await env.DB.prepare(`UPDATE organizations SET plan_tier = ? WHERE id = ?`).bind(tier, orgId).run();
    }
  } else if (event.type === 'customer.subscription.deleted') {
    const orgId = obj.metadata?.organization_id;
    if (orgId) {
      await env.DB.prepare(`UPDATE organizations SET plan_tier = 'free' WHERE id = ?`).bind(orgId).run();
    }
  }

  return json({ received: true });
}
