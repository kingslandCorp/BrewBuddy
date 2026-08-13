import { newId, newApiKey, json, errorResponse } from '../lib/db';

export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
}

export async function createOrganization(request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  if (!body || !body.name) return errorResponse('name is required');

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
      body.meeting_duration_minutes || 30,
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

  const fields = [
    'plan_tier',
    'meeting_duration_minutes',
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
