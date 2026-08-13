import { newId, json, errorResponse } from '../lib/db';
import { parseXlsxRows, parseDocxRows } from '../lib/fileImport';
import type { Env } from './organizations';

const FREE_TIER_PARTICIPANT_CAP = 12;

/** Free tier — add one participant at a time via the manual form. */
export async function addParticipant(orgId: string, org: any, request: Request, env: Env): Promise<Response> {
  const body = await request.json<Record<string, any>>().catch(() => null);
  if (!body || !body.name || !body.email) return errorResponse('name and email are required');

  if (org.plan_tier === 'free') {
    const { count } = (await env.DB.prepare(
      `SELECT COUNT(*) as count FROM participants WHERE organization_id = ? AND status != 'removed'`
    )
      .bind(orgId)
      .first()) as any;
    if (count >= FREE_TIER_PARTICIPANT_CAP) {
      return errorResponse(
        `Free plan is capped at ${FREE_TIER_PARTICIPANT_CAP} participants — upgrade to Plus for bulk import and a higher cap.`,
        402
      );
    }
  }

  const id = newId('p');
  await env.DB.prepare(
    `INSERT INTO participants (id, organization_id, name, email, added_via) VALUES (?, ?, ?, ?, 'manual')`
  )
    .bind(id, orgId, body.name, body.email)
    .run();

  return json({ id, organization_id: orgId, name: body.name, email: body.email, status: 'active', added_via: 'manual' }, 201);
}

export async function listParticipants(orgId: string, env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, status, added_via, joined_at FROM participants WHERE organization_id = ? ORDER BY joined_at DESC`
  )
    .bind(orgId)
    .all();
  return json({ participants: results });
}

/**
 * Freemium+ — bulk import a roster.
 *
 * Accepts, by Content-Type: application/json ({rows:[{name,email}]}),
 * plain CSV/text (name,email per line), an .xlsx workbook, or a .docx
 * roster (one "Name, email" per line/table row). All formats funnel into
 * the same {name, email}[] shape before hitting `importRows` below.
 */
export async function importParticipants(orgId: string, org: any, request: Request, env: Env): Promise<Response> {
  if (org.plan_tier === 'free') {
    return errorResponse('Bulk import requires the Plus plan or higher.', 402);
  }

  const contentType = request.headers.get('Content-Type') || '';
  let rows: { name: string; email: string }[] = [];

  if (contentType.includes('application/json')) {
    const body = await request.json<{ rows?: { name: string; email: string }[] }>().catch(() => null);
    rows = body?.rows || [];
  } else if (
    contentType.includes('spreadsheetml.sheet') ||
    contentType.includes('vnd.ms-excel')
  ) {
    rows = parseXlsxRows(await request.arrayBuffer());
  } else if (contentType.includes('wordprocessingml.document')) {
    rows = await parseDocxRows(await request.arrayBuffer());
  } else {
    const text = await request.text();
    rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, email] = line.split(',').map((s) => s.trim());
        return { name, email };
      })
      .filter((r) => r.name && r.email && r.email.includes('@'));
  }

  const jobId = newId('imp');
  const errors: { row: number; reason: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.name || !row.email || !row.email.includes('@')) {
      errors.push({ row: i + 1, reason: 'missing or invalid name/email' });
      continue;
    }
    await env.DB.prepare(
      `INSERT INTO participants (id, organization_id, name, email, added_via) VALUES (?, ?, ?, ?, 'bulk_import')`
    )
      .bind(newId('p'), orgId, row.name, row.email)
      .run();
    imported++;
  }

  await env.DB.prepare(
    `INSERT INTO import_jobs (id, organization_id, status, rows_parsed, rows_imported, errors_json)
     VALUES (?, ?, 'completed', ?, ?, ?)`
  )
    .bind(jobId, orgId, rows.length, imported, JSON.stringify(errors))
    .run();

  return json(
    { import_job_id: jobId, status: 'completed', rows_parsed: rows.length, rows_imported: imported, errors },
    201
  );
}
