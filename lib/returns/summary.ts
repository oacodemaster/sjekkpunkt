// Norwegian escalation summaries for the team lead, and audit lines in nb + en.
// Pure and deterministic: built from the engine decision, never from model prose.

import { productMap } from '@/lib/engine/catalog';
import type { EscalationReason, Grade, Product, ReturnDecision } from '@/lib/engine/types';

export type ItemEscalationReason = EscalationReason | 'worker_request';

const nok = (n: number) => `${n.toLocaleString('nb-NO').replace(/ /g, ' ')} kr`;

function baseName(p: Product | undefined, sku: string): string {
  return p ? p.nameNb.split(',')[0].trim() : sku;
}

/** "størrelse M i stedet for L" when only the size differs, otherwise full names. */
function swapPhrase(ordered: Product | undefined, received: Product | undefined, orderedSku: string, receivedSku: string): string {
  if (ordered && received && baseName(ordered, orderedSku) === baseName(received, receivedSku)) {
    if (ordered.size && received.size && ordered.size !== received.size) {
      return `størrelse ${received.size} i stedet for ${ordered.size}`;
    }
    return `${received.nameNb.split(',')[1]?.trim() ?? received.color} i stedet for ${ordered.nameNb.split(',')[1]?.trim() ?? ordered.color}`;
  }
  return `${received?.nameNb ?? receivedSku} i stedet for ${ordered?.nameNb ?? orderedSku}`;
}

const GRADE_NB: Record<Grade, (loc: string) => string> = {
  A: (loc) => `Varen er som ny, grad A, lagt på ${loc}.`,
  B: (loc) => `Varen har små merker eller mangler merkelapp, grad B, lagt på ${loc}.`,
  C: (loc) => `Varen har tydelig skade, grad C, til reparasjon på ${loc}.`,
  D: (loc) => `Varen kan ikke selges, grad D, til kassering på ${loc}.`,
};

const CAUSE_NB: Record<string, string> = {
  likely_warehouse_error: ', sannsynligvis vår pakkefeil.',
  inconclusive: ', men pakkebeviset viste riktig vare. Årsaken er uklar.',
  unknown: '. Det finnes ikke pakkebevis.',
};

/** Amount a note asks for, e.g. "5000 KR" -> 5000. */
export function requestedAmount(note: string | null): number | null {
  if (!note) return null;
  const m = note.match(/(\d[\d\s.]{2,})\s?(kr|nok|kroner)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export interface SummaryContext {
  returnId: string;
  decision: ReturnDecision;
  products: Product[];
  retakes?: number;
  lateDays?: number;
  returnWindowDays?: number;
  workerNoteNb?: string | null;
}

/** The facts about the item, in the order a lead wants them. */
export function itemFactsNb(ctx: SummaryContext): string {
  const d = ctx.decision;
  const pm = productMap(ctx.products);
  const ordered = pm.get(d.orderedSku);
  const parts: string[] = [];

  if (d.wrongItemShipped && d.receivedSku) {
    const swap = swapPhrase(ordered, pm.get(d.receivedSku), d.orderedSku, d.receivedSku);
    parts.push(`Retur ${ctx.returnId}: kunden fikk ${swap}${CAUSE_NB[d.cause ?? 'unknown'] ?? '.'}`);
  } else {
    parts.push(`Retur ${ctx.returnId}: ${baseName(ordered, d.orderedSku).toLowerCase()} (${d.orderedSku}).`);
  }
  if (d.grade && d.locationCode) parts.push(GRADE_NB[d.grade](d.locationCode));
  return parts.join(' ');
}

const REASON_NB: Record<ItemEscalationReason, (ctx: SummaryContext) => string> = {
  suspicious_note: (ctx) => {
    const asked = requestedAmount(ctx.decision.customerNoteText);
    return asked !== null && asked > ctx.decision.lineValueNok
      ? `Kundens lapp ber om ${asked} kroner i refusjon, som er over ordreverdien.`
      : 'Kundens lapp inneholder instruksjoner. Den er bare lest som tekst.';
  },
  low_confidence_after_retakes: (ctx) =>
    `Varen kunne ikke identifiseres sikkert etter ${(ctx.retakes ?? 0) + 1} bilder.`,
  wrong_item_inconclusive: () => 'Pakkebeviset viste riktig størrelse, så vi vet ikke hvor feilen oppstod.',
  customer_caused_damage: () => 'Skaden ser ut til å være kundens, så refusjonen må vurderes.',
  unknown_return: () => 'Pakken har ingen registrert retur.',
  late_return: (ctx) =>
    `Returen ble registrert ${ctx.lateDays ?? '?'} dager etter sending, over returfristen på ${ctx.returnWindowDays ?? 30} dager.`,
  manual_confirm_on_alert: () => 'En vare med aktivt pakkevarsel ble bekreftet manuelt.',
  face_in_frame_repeated: () => 'Et ansikt var med i bildet flere ganger. De bildene er slettet.',
  worker_request: (ctx) =>
    ctx.workerNoteNb ? `Medarbeideren sendte saken til deg: «${ctx.workerNoteNb}»` : 'Medarbeideren sendte saken til deg.',
};

export function escalationSummaryNb(reason: ItemEscalationReason, ctx: SummaryContext): string {
  return `${itemFactsNb(ctx)} ${REASON_NB[reason](ctx)} Den trenger din vurdering.`;
}

export function unknownReturnSummaryNb(code: string): string {
  return `Ukjent pakke skannet med koden «${code}». Pakken har ingen registrert retur. Den trenger din vurdering.`;
}

export function decidedAuditLines(returnId: string, d: ReturnDecision): { nb: string; en: string } {
  const refundNb = d.refundNok === null ? 'refusjon avgjøres av teamleder' : `refusjon ${nok(d.refundNok)}`;
  const refundEn = d.refundNok === null ? 'refund decided by team lead' : `refund ${d.refundNok} NOK`;
  const sku = d.receivedSku ?? d.orderedSku;
  return {
    nb: `Retur ${returnId}: ${sku} grad ${d.grade}, ${d.locationCode}, ${refundNb}`,
    en: `Return ${returnId}: ${sku} grade ${d.grade}, ${d.locationCode}, ${refundEn}`,
  };
}
