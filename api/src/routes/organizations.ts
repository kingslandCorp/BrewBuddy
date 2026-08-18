import { newId, newApiKey, json, errorResponse } from '../lib/db';
import { sendPasscodeResetEmail } from '../lib/email';

export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DAILY_API_KEY?: string;
}

export async function createOrganization(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  if (!body || !body.name) return errorResponse('name is required');
  // Required so passcode recovery always has somewhere to send a reset —
  // without it, a lost passcode would be permanently unrecoverable.
  if (!body.owner_email) return errorResponse('owner_email is required');

  const type = body.type === 'company' ? 'company' : 'friend_group';
  const id = newId('org');
  const apiKey = newApiKey();

  await env.DB.prepare(
    `INSERT INTO organizations
      (id, name, type, timezone, meeting_duration_minutes, meeting_time, match_frequency, api_key, owner_name, owner_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.name,
      type,
      body.timezone || 'UTC',
      30, // fixed — it's a coffee, not a meeting; not client-configurable
      body.meeting_time || '10:00',
      body.match_frequency || 'manual',
      apiKey,
      body.owner_name || null,
      body.owner_email || null
    )
    .run();

  return json(
    {
      id,
      name: body.name,
      type,
      plan_tier: 'free',
      api_key: apiKey, // shown once — store it, it won't be re-displayed
      created_at: new Date().toISOString(),
    },
    201
  );
}

export async function getOrganization(orgId: string, env: Env): Promise<Response> {
  const org = await env.DB.prepare(
    `SELECT id, name, type, plan_tier, timezone, meeting_duration_minutes,
            meeting_time, match_frequency, repeat_cooldown_rounds, created_at
     FROM organizations WHERE id = ?`
  )
    .bind(orgId)
    .first();

  if (!org) return errorResponse('organization not found', 404);
  return json(org);
}

export async function updateOrganization(orgId: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  if (!body) return errorResponse('invalid body');

  // meeting_duration_minutes is deliberately absent — fixed at 30, not
  // client-configurable. It's a coffee, not a meeting.
  const fields = [
    'plan_tier',
    'meeting_time',
    'match_frequency',
    'repeat_cooldown_rounds',
    'timezone',
  ];
  const updates = fields.filter((f) => f in body);
  if (updates.length === 0) return errorResponse('no updatable fields provided');

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  await env.DB.prepare(`UPDATE organizations SET ${setClause} WHERE id = ?`)
    .bind(...updates.map((f) => body[f]), orgId)
    .run();

  return getOrganization(orgId, env);
}

/**
 * Group name + passcode, in place of org ID + API key. Names aren't
 * unique, but the (name, passcode) pair together is — matching on both
 * at once means a name collision can't be used to guess at another
 * group's passcode, and vice versa.
 */
export async function loginOrganization(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  if (!body || !body.name || !body.passcode) {
    return errorResponse('name and passcode are both required');
  }

  const org = await env.DB.prepare(
    `SELECT id, name, type, plan_tier, timezone, meeting_duration_minutes,
            meeting_time, match_frequency, repeat_cooldown_rounds, api_key, created_at
     FROM organizations WHERE name = ? AND api_key = ?`
  )
    .bind(body.name, body.passcode)
    .first();

  if (!org) return errorResponse("Couldn't find a group with that name and passcode.", 401);
  return json(org);
}

/**
 * Regenerates the passcode for every organization matching this name and
 * emails each new passcode only to that org's on-file owner_email — never
 * to an address supplied in the request. Always returns the same generic
 * message regardless of whether a match was found, so this can't be used
 * to test whether a given group name exists.
 */
export async function forgotPasscode(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  const genericResponse = json({
    message: "If we found a group with that name, we've emailed a new passcode to the address on file.",
  });
  if (!body || !body.name) return genericResponse;

  const { results: matches } = await env.DB.prepare(
    `SELECT id, name, owner_email FROM organizations WHERE name = ? AND owner_email IS NOT NULL`
  )
    .bind(body.name)
    .all();

  for (const org of matches as any[]) {
    const newPasscode = newApiKey();
    await env.DB.prepare(`UPDATE organizations SET api_key = ? WHERE id = ?`).bind(newPasscode, org.id).run();
    if (env.RESEND_API_KEY) {
      const result = await sendPasscodeResetEmail(env.RESEND_API_KEY, org.owner_email, org.name, newPasscode).catch(
        (err) => ({ ok: false, error: String(err) })
      );
      if (!result.ok) console.error(`[forgot-passcode] email failed for org ${org.id}: ${result.error}`);
    }
  }

  return genericResponse;
}
