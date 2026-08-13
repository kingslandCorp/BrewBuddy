import { newId, json, errorResponse } from '../lib/db';
import { determineGroupSize, buildGroups, pairsWithinGroup, Participant } from '../lib/matching';
import type { Env } from './organizations';

export interface RoundResult {
  id: string;
  status: 'matched';
  participant_count: number;
  group_size_used: number;
  groups: string[];
}

/**
 * Core matching + persistence logic for a round. Shared by the HTTP
 * endpoint (POST /v1/organizations/:id/rounds) and the cron handler that
 * auto-triggers rounds for orgs on a weekly/fortnightly/monthly cadence.
 */
export async function runRoundForOrg(
  orgId: string,
  org: any,
  env: Env,
  scheduledDate: string = new Date().toISOString().slice(0, 10),
  sizeOverride?: number
): Promise<RoundResult | { error: string }> {
  const { results: participantRows } = await env.DB.prepare(
    `SELECT id, name, email FROM participants WHERE organization_id = ? AND status = 'active'`
  )
    .bind(orgId)
    .all();
  const participants = participantRows as unknown as Participant[];

  if (participants.length < 2) {
    return { error: 'Need at least 2 active participants to run a round.' };
  }

  // Pull recent match history within the org's cooldown window so the
  // shuffle can avoid re-pairing people who just met.
  const cooldownRounds: number = org.repeat_cooldown_rounds ?? 3;
  const { results: recentRoundIds } = await env.DB.prepare(
    `SELECT id FROM rounds WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?`
  )
    .bind(orgId, cooldownRounds)
    .all();
  const roundIds = (recentRoundIds as any[]).map((r) => r.id);

  const recentPairs = new Set<string>();
  if (roundIds.length > 0) {
    const placeholders = roundIds.map(() => '?').join(',');
    const { results: historyRows } = await env.DB.prepare(
      `SELECT participant_a_id, participant_b_id FROM match_history
       WHERE organization_id = ? AND round_id IN (${placeholders})`
    )
      .bind(orgId, ...roundIds)
      .all();
    for (const row of historyRows as any[]) {
      recentPairs.add([row.participant_a_id, row.participant_b_id].sort().join('::'));
    }
  }

  const targetSize = determineGroupSize(participants.length, sizeOverride);
  const builtGroups = buildGroups(participants, targetSize, recentPairs);

  const roundId = newId('round');
  await env.DB.prepare(
    `INSERT INTO rounds (id, organization_id, scheduled_date, status, participant_count_snapshot, group_size_used)
     VALUES (?, ?, ?, 'matched', ?, ?)`
  )
    .bind(roundId, orgId, scheduledDate, participants.length, targetSize)
    .run();

  const meetingTimeIso = `${scheduledDate}T${(org.meeting_time || '10:00')}:00Z`;
  const groupIds: string[] = [];

  for (const g of builtGroups) {
    const groupId = newId('grp');
    groupIds.push(groupId);

    await env.DB.prepare(
      `INSERT INTO groups (id, round_id, organization_id, group_size_reason, meeting_time, duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(groupId, roundId, orgId, g.sizeReason, meetingTimeIso, org.meeting_duration_minutes || 30)
      .run();

    for (const participantId of g.participantIds) {
      await env.DB.prepare(`INSERT INTO group_participants (group_id, participant_id) VALUES (?, ?)`)
        .bind(groupId, participantId)
        .run();
    }

    for (const [a, b] of pairsWithinGroup(g.participantIds)) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO match_history (organization_id, participant_a_id, participant_b_id, round_id)
         VALUES (?, ?, ?, ?)`
      )
        .bind(orgId, a, b, roundId)
        .run();
    }
  }

  return {
    id: roundId,
    status: 'matched',
    participant_count: participants.length,
    group_size_used: targetSize,
    groups: groupIds,
  };
}

export async function triggerRound(orgId: string, org: any, request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => ({} as any));
  const scheduledDate: string = body.scheduled_date || new Date().toISOString().slice(0, 10);
  const result = await runRoundForOrg(orgId, org, env, scheduledDate, body.group_size);

  if ('error' in result) return errorResponse(result.error);
  return json(result, 201);
}
