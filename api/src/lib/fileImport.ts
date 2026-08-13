import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export interface ImportRow {
  name: string;
  email: string;
}

function pickField(row: Record<string, any>, wanted: 'name' | 'email'): string | undefined {
  for (const key of Object.keys(row)) {
    if (key.trim().toLowerCase() === wanted) return String(row[key] ?? '').trim();
  }
  return undefined;
}

/** Parses the first sheet of an .xlsx workbook. Expects a header row containing "name" and "email" columns (case-insensitive). */
export function parseXlsxRows(buffer: ArrayBuffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

  return rows
    .map((row) => ({ name: pickField(row, 'name') || '', email: pickField(row, 'email') || '' }))
    .filter((r) => r.name && r.email.includes('@'));
}

/**
 * Parses a .docx roster. Word docs have no native tabular structure the
 * way a spreadsheet does, so the supported format is one person per line
 * — "Name, email@example.com" — same convention as the plain-CSV import.
 * A real table pasted into the doc also works: mammoth renders each table
 * row as tab-separated text, which the comma/tab split below handles too.
 */
export async function parseDocxRows(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const { value: text } = await mammoth.extractRawText({ arrayBuffer: buffer });

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(/[,\t]/).map((s) => s.trim());
      return { name, email };
    })
    .filter((r): r is ImportRow => !!r.name && !!r.email && r.email.includes('@'));
}
