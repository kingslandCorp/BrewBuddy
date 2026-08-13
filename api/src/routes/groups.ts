import { json, errorResponse } from '../lib/db';
import { generateIcs } from '../lib/ics';
import type { Env } from './organizations';

async function loadGroupWithParticipants(groupId: string, env: Env) {
  const group = await env.DB.prepare(
    `SELECT g.*, o.name as org_name, o.plan_tier
     FROM groups g JOIN organizations o ON o.id = g.organization_id
     WHERE g.id = ?`
  )
    .bind(groupId)
    .first();
  if (!group) return null;

  const { results: participants } = await env.DB.prepare(
    `SELECT p.id, p.name, p.email FROM group_participants gp
     JOIN participants p ON p.id = gp.participant_id
     WHERE gp.group_id = ?`
  )
    .bind(groupId)
    .all();

  return { group, participants };
}

export async function getGroup(groupId: string, env: Env): Promise<Response> {
  const data = await loadGroupWithParticipants(groupId, env);
  if (!data) return errorResponse('group not found', 404);

  return json({
    id: data.group.id,
    round_id: data.group.round_id,
    participants: data.participants,
    meeting_time: data.group.meeting_time,
    duration_minutes: data.group.duration_minutes,
    group_size_reason: data.group.group_size_reason,
    ics_generated: !!data.group.ics_generated,
    status: data.group.status,
  });
}

/**
 * Freemium+ — generate the .ics invite for a group and (in production)
 * email it to every participant. Sending is stubbed here — swap in a
 * transactional email provider (Postmark, SES, Resend) to actually deliver
 * it; the .ics content itself is fully generated and returned as-is.
 */
export async function generateInvite(groupId: string, env: Env): Promise<Response> {
  const data = await loadGroupWithParticipants(groupId, env);
  if (!data) return errorResponse('group not found', 404);

  if (data.group.plan_tier === 'free') {
    return errorResponse('Calendar invites require the Plus plan or higher.', 402);
  }

  const ics = generateIcs({
    groupId: data.group.id,
    orgName: data.group.org_name,
    meetingTimeUtc: new Date(data.group.meeting_time),
    durationMinutes: data.group.duration_minutes,
    participants: data.participants as any,
  });

  await env.DB.prepare(`UPDATE groups SET ics_generated = 1 WHERE id = ?`).bind(groupId).run();

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="brew-buddies-${groupId}.ics"`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
