import { json, errorResponse } from '../lib/db';
import { generateIcs } from '../lib/ics';
import { sendInviteEmail } from '../lib/email';
import { createCallRoom } from '../lib/videoCall';
import type { Env } from './organizations';

const VIDEO_CALL_TIERS = new Set(['community', 'corporate']);

interface GroupRow {
  id: string;
  round_id: string;
  meeting_time: string;
  duration_minutes: number;
  group_size_reason: string;
  ics_generated: number;
  status: string;
  org_name: string;
  plan_tier: string;
}

async function loadGroupWithParticipants(groupId: string, env: Env) {
  const group = await env.DB.prepare(
    `SELECT g.*, o.name as org_name, o.plan_tier
     FROM groups g JOIN organizations o ON o.id = g.organization_id
     WHERE g.id = ?`
  )
    .bind(groupId)
    .first<GroupRow>();
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
 * Freemium+ — generate the .ics invite for a group and email it to every
 * participant via Resend (if RESEND_API_KEY is configured; falls back to
 * generate-only if not, so this endpoint still works pre-setup). Email
 * failures are logged but don't fail the request — the .ics is always
 * returned regardless of delivery outcome.
 */
export async function generateInvite(groupId: string, env: Env): Promise<Response> {
  const data = await loadGroupWithParticipants(groupId, env);
  if (!data) return errorResponse('group not found', 404);

  if (data.group.plan_tier === 'free') {
    return errorResponse('Calendar invites require the Plus plan or higher.', 402);
  }

  const meetingTimeUtc = new Date(data.group.meeting_time);
  const participants = data.participants as { id: string; name: string; email: string }[];

  let videoLink: string | null = null;
  if (env.DAILY_API_KEY && VIDEO_CALL_TIERS.has(data.group.plan_tier)) {
    const room = await createCallRoom(
      env.DAILY_API_KEY,
      data.group.id,
      meetingTimeUtc,
      data.group.duration_minutes
    ).catch((err) => ({ error: String(err) }));
    if ('url' in room) videoLink = room.url;
    else console.error(`[video-call] room creation failed for ${data.group.id}: ${room.error}`);
  }

  const ics = generateIcs({
    groupId: data.group.id,
    orgName: data.group.org_name,
    meetingTimeUtc,
    durationMinutes: data.group.duration_minutes,
    participants,
    videoLink,
  });

  await env.DB.prepare(`UPDATE groups SET ics_generated = 1 WHERE id = ?`).bind(groupId).run();

  let emailStatus = 'not_configured';
  if (env.RESEND_API_KEY) {
    const results = await Promise.all(
      participants.map(async (p) => {
        const otherNames = participants
          .filter((x) => x.id !== p.id)
          .map((x) => x.name)
          .join(', ') || 'your table';
        const result = await sendInviteEmail(
          env.RESEND_API_KEY!,
          p.email,
          p.name,
          data.group.org_name,
          otherNames,
          meetingTimeUtc,
          ics,
          videoLink
        ).catch((err) => ({ ok: false, error: String(err) }));
        if (!result.ok) console.error(`[invite-email] failed for ${p.email}: ${result.error}`);
        return `${p.email}:${result.ok ? 'sent' : 'failed(' + (result as any).error + ')'}`;
      })
    );
    emailStatus = results.join(',');
  }

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="brew-buddies-${groupId}.ics"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Email-Status',
      'X-Email-Status': emailStatus,
    },
  });
}
