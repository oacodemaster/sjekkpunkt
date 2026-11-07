// CSV import (M7): parse, validate per row, group into products / orders / returns.
// Pure, so the admin page can show the same errors as the server before anything is written.

import { IMPORT_COLUMNS, IMPORT_REQUIRED, importRowSchemas, type ImportKind, type ImportRow } from './schemas';

export const MAX_IMPORT_ROWS = 2_000;

/** RFC 4180 CSV: quoted fields, "" escapes, CRLF or LF. Comma or semicolon (Norwegian Excel) separator. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface ImportIssue {
  line: number; // 1-based line in the file (the header is line 1)
  column?: string;
  code: string;
}

export type ImportPlan =
  | { kind: 'products'; products: (ImportRow<'products'> & { line: number })[] }
  | { kind: 'orders'; orders: { line: number; ext_id: string; customer_ref: string; lines: { line: number; sku: string; qty: number; price_nok?: number }[] }[] }
  | {
      kind: 'returns';
      returns: {
        line: number;
        ext_id: string;
        order_ext_id: string;
        customer_reason_nb: string;
        registered_at?: string;
        items: { line: number; sku: string; qty: number }[];
      }[];
    };

export interface ImportCheck {
  rows: number;
  issues: ImportIssue[];
  plan: ImportPlan | null; // null when there are issues
}

/** Header check, row schema, and grouping rules. Database checks (SKUs exist, duplicates) run on the server. */
export function checkImport(kind: ImportKind, text: string): ImportCheck {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: 0, issues: [{ line: 1, code: 'empty_file' }], plan: null };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const issues: ImportIssue[] = [];
  for (const col of IMPORT_REQUIRED[kind]) if (!header.includes(col)) issues.push({ line: 1, column: col, code: 'missing_column' });
  for (const col of header) if (col && !IMPORT_COLUMNS[kind].includes(col)) issues.push({ line: 1, column: col, code: 'unknown_column' });
  const body = table.slice(1);
  if (body.length === 0) issues.push({ line: 2, code: 'no_rows' });
  if (body.length > MAX_IMPORT_ROWS) issues.push({ line: MAX_IMPORT_ROWS + 2, code: 'too_many_rows' });
  if (issues.length) return { rows: body.length, issues, plan: null };

  const schema = importRowSchemas[kind];
  const parsed: { line: number; row: Record<string, unknown> }[] = [];
  body.forEach((cells, i) => {
    const line = i + 2;
    if (cells.length > header.length) issues.push({ line, code: 'too_many_fields' });
    const raw = Object.fromEntries(header.map((h, k) => [h, cells[k] ?? '']));
    const r = schema.safeParse(raw);
    if (r.success) parsed.push({ line, row: r.data as Record<string, unknown> });
    else for (const iss of r.error.issues) issues.push({ line, column: String(iss.path[0] ?? ''), code: iss.message.match(/^[a-z_]+$/) ? iss.message : iss.code });
  });
  if (issues.length) return { rows: body.length, issues, plan: null };

  if (kind === 'products') {
    const seen = new Map<string, number>();
    for (const { line, row } of parsed) {
      const s = row.sku as string;
      if (seen.has(s)) issues.push({ line, column: 'sku', code: 'duplicate_in_file' });
      seen.set(s, line);
    }
    return { rows: body.length, issues, plan: issues.length ? null : { kind, products: parsed.map((p) => ({ ...(p.row as ImportRow<'products'>), line: p.line })) } };
  }

  if (kind === 'orders') {
    const orders = new Map<string, Extract<ImportPlan, { kind: 'orders' }>['orders'][number]>();
    for (const { line, row } of parsed) {
      const r = row as ImportRow<'orders'>;
      const o = orders.get(r.order) ?? { line, ext_id: r.order, customer_ref: r.customer_ref, lines: [] };
      if (o.customer_ref !== r.customer_ref) issues.push({ line, column: 'customer_ref', code: 'customer_differs' });
      if (o.lines.some((l) => l.sku === r.sku)) issues.push({ line, column: 'sku', code: 'duplicate_line' });
      o.lines.push({ line, sku: r.sku, qty: r.qty, price_nok: r.price_nok });
      orders.set(r.order, o);
    }
    return { rows: body.length, issues, plan: issues.length ? null : { kind, orders: [...orders.values()] } };
  }

  const returns = new Map<string, Extract<ImportPlan, { kind: 'returns' }>['returns'][number]>();
  for (const { line, row } of parsed) {
    const r = row as ImportRow<'returns'>;
    const x = returns.get(r.return) ?? { line, ext_id: r.return, order_ext_id: r.order, customer_reason_nb: r.customer_reason_nb, registered_at: r.registered_at, items: [] };
    if (x.order_ext_id !== r.order) issues.push({ line, column: 'order', code: 'order_differs' });
    x.items.push({ line, sku: r.sku, qty: r.qty });
    returns.set(r.return, x);
  }
  return { rows: body.length, issues, plan: issues.length ? null : { kind: 'returns', returns: [...returns.values()] } };
}

/** Header plus one example row per kind, for the "download template" link. */
export const IMPORT_TEMPLATES: Record<ImportKind, string> = {
  products: `${IMPORT_COLUMNS.products.join(',')}\nTS-WHITE-XL,"T-skjorte, hvit, XL","T-shirt, white, XL",apparel,white,XL,199,E-18-2,tee-white,7090000009991\n`,
  orders: `${IMPORT_COLUMNS.orders.join(',')}\n3001,Testkunde 3001,HD-NAVY-M,1,599\n3001,Testkunde 3001,SK-WOOL-40,2,149\n`,
  returns: `${IMPORT_COLUMNS.returns.join(',')}\n1201,1043,Fikk feil størrelse,JK-SHELL-L,1,2026-11-06T10:00:00+01:00\n`,
};

export const ISSUE_NB: Record<string, string> = {
  empty_file: 'Filen er tom.',
  no_rows: 'Ingen rader under overskriften.',
  too_many_rows: `Maks ${MAX_IMPORT_ROWS} rader per import.`,
  missing_column: 'Kolonnen mangler.',
  unknown_column: 'Ukjent kolonne.',
  too_many_fields: 'Flere felt enn kolonner.',
  duplicate_in_file: 'Samme SKU to ganger i filen.',
  duplicate_line: 'Samme SKU to ganger i samme ordre.',
  customer_differs: 'Ulik kunde for samme ordre.',
  order_differs: 'Ulik ordre for samme retur.',
  sku_format: 'SKU: store bokstaver, tall og bindestrek.',
  barcode_format: 'Strekkode: 8, 12, 13 eller 14 sifre.',
  number_format: 'Må være et heltall.',
  id_format: 'Bokstaver, tall og bindestrek.',
  too_small: 'For lav eller for kort.',
  too_big: 'For høy eller for lang.',
  invalid_value: 'Ugyldig verdi.',
  invalid_format: 'Ugyldig format.',
  invalid_union: 'Ugyldig format.',
  invalid_type: 'Mangler eller har feil type.',
  // Server-side checks
  unknown_sku: 'Ukjent SKU.',
  unknown_location: 'Ukjent lokasjon.',
  unknown_order: 'Ukjent ordre.',
  sku_not_in_order: 'SKU-en er ikke i ordren.',
  order_exists: 'Ordren finnes allerede.',
  return_exists: 'Returen finnes allerede.',
  barcode_taken: 'Strekkoden brukes av en annen vare.',
};
