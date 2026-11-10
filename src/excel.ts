import * as XLSX from 'xlsx';
import type { Cell } from './dataset';

const p2 = (n: number) => String(n).padStart(2, '0');

// Excel stores dates as serial numbers; read the calendar fields directly (no time-zone math).
function serialToText(v: number): string {
  const d = XLSX.SSF.parse_date_code(v);
  const time = `${p2(d.H)}:${p2(d.M)}:${p2(Math.floor(d.S))}`;
  if (v < 1) return time; // time-only cell
  const day = `${d.y}-${p2(d.m)}-${p2(d.d)}`;
  return d.H || d.M || d.S ? `${day} ${time}` : day;
}

function cellValue(c: XLSX.CellObject | undefined): Cell {
  if (!c || c.v === undefined || c.v === null) return null;
  switch (c.t) {
    case 'n':
      return typeof c.z === 'string' && XLSX.SSF.is_date(c.z) ? serialToText(c.v as number) : (c.v as number);
    case 's': {
      const s = String(c.v).trim();
      return s === '' ? null : s;
    }
    case 'b':
      return c.v ? 'TRUE' : 'FALSE';
    case 'd':
      return c.v instanceof Date ? c.v.toISOString().slice(0, 10) : String(c.v);
    default:
      return null; // errors / stubs
  }
}

/** Sheet names only (does not parse cell data). */
export function listSheets(buf: ArrayBuffer): string[] {
  return XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
}

/** One sheet as a sparse-safe matrix of rows (ascending), blank rows dropped. */
export function readSheet(buf: ArrayBuffer, sheetName: string): Cell[][] {
  const wb = XLSX.read(buf, { type: 'array', sheets: sheetName, cellNF: true, cellText: false });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  // Walk existing cells only: some sheets declare a huge used range (formatted whole columns).
  const rows = new Map<number, Map<number, Cell>>();
  let maxC = -1;
  for (const key of Object.keys(ws)) {
    if (key.charCodeAt(0) === 33 /* '!' meta keys */) continue;
    const v = cellValue(ws[key] as XLSX.CellObject);
    if (v === null) continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    let row = rows.get(r);
    if (!row) rows.set(r, (row = new Map()));
    row.set(c, v);
    if (c > maxC) maxC = c;
  }

  return [...rows.keys()]
    .sort((a, b) => a - b)
    .map((r) => {
      const row = rows.get(r)!;
      return Array.from({ length: maxC + 1 }, (_, c) => row.get(c) ?? null);
    });
}
