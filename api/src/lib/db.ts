// Brew Buddies — shared helpers

export function newId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `${prefix}_${random}`;
}

export function newApiKey(): string {
  return 'bb_' + crypto.randomUUID().replace(/-/g, '');
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Every org-scoped request must present its API key as a Bearer token.
 * Returns the organization row, or null if the key is missing/invalid.
 */
export async function authenticate(
  request: Request,
  db: D1Database,
  orgIdFromPath: string
): Promise<Record<string, unknown> | null> {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!key) return null;

  const org = await db
    .prepare('SELECT * FROM organizations WHERE id = ? AND api_key = ?')
    .bind(orgIdFromPath, key)
    .first();

  return org ?? null;
}
