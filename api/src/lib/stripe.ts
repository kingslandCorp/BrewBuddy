// Brew Buddies — Stripe billing helpers.
// Plain REST calls (no Stripe SDK) so the Worker stays dependency-light;
// Cloudflare Workers' Web Crypto covers webhook signature verification.

export type Tier = 'plus' | 'community' | 'corporate';
export type Interval = 'month' | 'year';

/** Flat-rate pricing: Plus, Community, and Corporate each have a monthly
 * and a yearly price on the same Stripe product (yearly = 10x monthly,
 * i.e. ~2 months free) — same pattern as Stripe's flat-rate pricing guide. */
export const TIER_PRICE_IDS: Record<Tier, Record<Interval, string>> = {
  plus: {
    month: 'price_1U47THIgiAIZiKh9JehuVNke',
    year: 'price_1U47xuIgiAIZiKh9c0VrJHoD',
  },
  community: {
    month: 'price_1U47TIIgiAIZiKh9Dp7LUpoD',
    year: 'price_1U47xuIgiAIZiKh9b5DjWu2i',
  },
  corporate: {
    month: 'price_1U47TJIgiAIZiKh9mHgbeeXn',
    year: 'price_1U47xvIgiAIZiKh9Lf2nNEho',
  },
};

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function createCheckoutSession(
  secretKey: string,
  opts: { orgId: string; tier: Tier; interval: Interval; successUrl: string; cancelUrl: string }
): Promise<{ url: string } | { error: string }> {
  const priceId = TIER_PRICE_IDS[opts.tier]?.[opts.interval];
  if (!priceId) return { error: `unknown tier/interval: ${opts.tier}/${opts.interval}` };

  const body = formEncode({
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    'subscription_data[metadata][organization_id]': opts.orgId,
    'subscription_data[metadata][tier]': opts.tier,
    'managed_payments[enabled]': 'false',
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { error: `Stripe ${res.status}: ${errBody}` };
  }
  const session = (await res.json()) as { url: string };
  return { url: session.url };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Verifies the Stripe-Signature header per Stripe's HMAC-SHA256 scheme. */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string
): Promise<boolean> {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(hexToBytes(expectedHex), hexToBytes(signature));
}
