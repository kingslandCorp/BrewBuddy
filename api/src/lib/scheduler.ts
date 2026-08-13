import { runRoundForOrg } from '../routes/rounds';
import type { Env } from '../routes/organizations';

const FREQUENCY_DAYS: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
};

function daysSince(dateStr: string, now: Date): number {
  const then = new Date(`${dateStr}T00:00:00Z`).getTime();
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

/**
 * Runs once a day (see [triggers] in wrangler.toml). For every org on a
 * weekly/fortnightly/monthly cadence, checks whether enough time has
 * passed since its last round and, if so, runs the matching engine again.
 * Orgs with no prior round are treated as due immediately. Orgs with fewer
 * than 2 active participants are silently skipped (same guard as the
 * manual endpoint) rather than treated as an error, since a due-but-empty
 * org isn't actionable — it'll be picked up automatically once it has
 * enough people.
 */
export async function runDueRounds(env: Env, now: Date = new Date()): Promise<{ orgId: string; result: string }[]> {
  const { results: orgs } = await env.DB.prepare(
    `SELECT * FROM organizations WHERE match_frequency IN ('weekly','fortnightly','monthly')`
  ).all();

  const outcomes: { orgId: string; result: string }[] = [];

  for (const org of orgs as any[]) {
    const intervalDays = FREQUENCY_DAYS[org.match_frequency];
    const lastRound = await env.DB.prepare(
      `SELECT scheduled_date FROM rounds WHERE organization_id = ? ORDER BY scheduled_date DESC LIMIT 1`
    )
      .bind(org.id)
      .first<{ scheduled_date: string }>();

    const due = !lastRound || daysSince(lastRound.scheduled_date, now) >= intervalDays;
    if (!due) {
      outcomes.push({ orgId: org.id, result: 'not_due' });
      continue;
    }

    const result = await runRoundForOrg(org.id, org, env, now.toISOString().slice(0, 10));
    if ('error' in result) {
      outcomes.push({ orgId: org.id, result: `skipped: ${result.error}` });
    } else {
      outcomes.push({ orgId: org.id, result: `matched round ${result.id} (${result.groups.length} groups)` });
    }
  }

  return outcomes;
}
