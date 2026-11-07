import { describe, expect, it } from 'vitest';
import { DEMO_NOW, ORDERS, PACK_CHECKS, PRODUCTS, RETURNS } from '@/lib/demo/seed';
import { RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from '@/lib/demo/visionFixtures';
import { evaluateReturn } from '@/lib/engine/returns';
import type { ReturnInspection } from '@/lib/engine/types';
import { escalationResult, listResult } from '@/lib/voice/lead-tools';
import { availableActions, planResolution, resolutionLines, type ItemState } from './plan';
import type { LeadCard } from './types';

const now = new Date(DEMO_NOW);
const ret = RETURNS.find((r) => r.id === '1043')!;
const order = ORDERS.find((o) => o.id === '1043')!;
const evidence = PACK_CHECKS.find((p) => p.id === 'PC-1043')!;
const ctx = { products: PRODUCTS, validLocations: ['C-14-2', 'C-14-3', 'B-OUT-1', 'R-REP-1', 'X-KASS'] };
const evalR = (inspections: ReturnInspection[]) => evaluateReturn(ret, order, evidence, { inspections }, {}, { products: PRODUCTS, now });

/** Return 1043 after confirm: grade A on C-14-2, 1 499 kr, suspicious note escalated. */
const decided1043: ItemState = (() => {
  const proposal = evalR([RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE]);
  return {
    proposal,
    decided: { grade: 'A', locationCode: 'C-14-2', refundNok: 1499, cause: proposal.cause, flags: proposal.flags, isOverride: false, overrideReason: null, receivedSku: 'JK-SHELL-M' },
  };
})();

describe('lead resolutions (R15)', () => {
  it('approve keeps a decided item as it is', () => {
    const p = planResolution('return_item', { action: 'approve' }, decided1043, ctx);
    expect(p).toEqual({ ok: true, decision: null, writesItemEffects: false, note: null });
  });

  it('an override needs a reason and the refund stays capped at the line value', () => {
    expect(planResolution('return_item', { action: 'override', refundNok: 5000, reason: ' ' }, decided1043, ctx)).toEqual({ ok: false, error: 'reason_required' });
    const p = planResolution('return_item', { action: 'override', refundNok: 5000, reason: 'Kunden ringte' }, decided1043, ctx);
    expect(p.ok && p.decision).toMatchObject({ grade: 'A', locationCode: 'C-14-2', refundNok: 1499, isOverride: true, overrideReason: 'Kunden ringte', receivedSku: 'JK-SHELL-M' });
  });

  it('a new grade moves the shelf by R6 unless the lead picks one', () => {
    const b = planResolution('return_item', { action: 'override', grade: 'B', refundNok: 900, reason: 'Merke på ermet' }, decided1043, ctx);
    expect(b.ok && b.decision).toMatchObject({ grade: 'B', locationCode: 'B-OUT-1', refundNok: 900 });
    const picked = planResolution('return_item', { action: 'override', grade: 'C', locationCode: 'X-KASS', reason: 'x' }, decided1043, ctx);
    expect(picked.ok && picked.decision).toMatchObject({ grade: 'C', locationCode: 'X-KASS' });
    expect(planResolution('return_item', { action: 'override', locationCode: 'Z-99', reason: 'x' }, decided1043, ctx)).toEqual({ ok: false, error: 'bad_location' });
  });

  it('reject sets the refund to 0 with a reason and keeps grade and shelf', () => {
    expect(planResolution('return_item', { action: 'reject' }, decided1043, ctx)).toEqual({ ok: false, error: 'reason_required' });
    const p = planResolution('return_item', { action: 'reject', reason: 'Svindelforsøk' }, decided1043, ctx);
    expect(p.ok && p.decision).toMatchObject({ grade: 'A', locationCode: 'C-14-2', refundNok: 0, isOverride: true });
  });

  it('a refund the lead must decide (C/D, customer side) cannot be approved without an amount', () => {
    const damaged = evalR([
      { ...RET_1043_FRONT, identifiedSku: 'JK-SHELL-L', condition: { ...RET_1043_FRONT.condition, damage: 'major' } },
      { ...RET_1043_LABEL, sizeRead: 'L', identifiedSku: 'JK-SHELL-L' },
    ]);
    expect(damaged.grade).toBe('C');
    expect(damaged.refundNok).toBeNull();
    const state: ItemState = { proposal: damaged, decided: { grade: 'C', locationCode: 'R-REP-1', refundNok: null, cause: damaged.cause, flags: [], isOverride: false, overrideReason: null, receivedSku: 'JK-SHELL-L' } };
    expect(availableActions('return_item', state)).toEqual({ approve: false, override: true, reject: true, refundRequired: true });
    expect(planResolution('return_item', { action: 'approve' }, state, ctx)).toEqual({ ok: false, error: 'refund_required' });
    expect(planResolution('return_item', { action: 'override', reason: 'Ser på det' }, state, ctx)).toEqual({ ok: false, error: 'refund_required' });
    const p = planResolution('return_item', { action: 'override', refundNok: 700, reason: 'Halv refusjon' }, state, ctx);
    expect(p.ok && p.decision).toMatchObject({ grade: 'C', refundNok: 700 });
  });

  it('an undecided item (sent by the worker) is approved from the engine proposal, with its stock and loop effects', () => {
    const proposal = evalR([RET_1043_FRONT, RET_1043_LABEL]);
    const p = planResolution('return_item', { action: 'approve' }, { proposal, decided: null }, ctx);
    expect(p.ok && p.writesItemEffects).toBe(true);
    expect(p.ok && p.decision).toMatchObject({ grade: 'A', locationCode: 'C-14-2', refundNok: 1499, isOverride: false });
    const blurry = evalR([RET_1043_FRONT]);
    expect(planResolution('return_item', { action: 'approve' }, { proposal: blurry, decided: null }, ctx)).toEqual({ ok: false, error: 'not_ready' });
    expect(planResolution('return_item', { action: 'override', reason: 'x' }, { proposal: blurry, decided: null }, ctx)).toEqual({ ok: false, error: 'shelf_required' });
    const noGrade = { ...blurry, grade: null, locationCode: null };
    expect(planResolution('return_item', { action: 'override', reason: 'x' }, { proposal: noGrade, decided: null }, ctx)).toEqual({ ok: false, error: 'grade_required' });
    const shelved = planResolution('return_item', { action: 'override', locationCode: 'C-14-3', refundNok: 1499, reason: 'Sjekket selv' }, { proposal: blurry, decided: null }, ctx);
    expect(shelved.ok && shelved.decision).toMatchObject({ locationCode: 'C-14-3', refundNok: 1499 });
  });

  it('cards that are not about an item are approved or rejected, never overridden', () => {
    expect(planResolution('parcel', { action: 'override', reason: 'x' }, undefined, ctx)).toEqual({ ok: false, error: 'not_applicable' });
    expect(planResolution('order', { action: 'reject' }, undefined, ctx)).toEqual({ ok: false, error: 'reason_required' });
    expect(planResolution('order', { action: 'approve', note: 'Sjekket' }, undefined, ctx)).toEqual({ ok: true, decision: null, writesItemEffects: false, note: 'Sjekket' });
  });

  it('audit lines say who did what, in both languages', () => {
    const p = planResolution('return_item', { action: 'override', grade: 'B', refundNok: 900, reason: 'Merke' }, decided1043, ctx);
    const l = resolutionLines('Retur 1043', 'Return 1043', 'suspicious_note', 'override', p.ok ? p.decision : null, 'Merke');
    expect(l.nb).toBe('Retur 1043: overstyrt av teamleder til grad B, B-OUT-1, refusjon 900 kr (Mistenkelig kundelapp). Grunn: «Merke»');
    expect(l.en).toContain('overridden by team lead to grade B');
  });
});

describe('lead agent tools', () => {
  const card: LeadCard = {
    id: 'e1',
    reason: 'suspicious_note',
    entityType: 'return_item',
    refLabel: 'Retur 1043',
    href: '/holio/returns/1043',
    summaryNb: 'Retur 1043: kunden fikk størrelse M i stedet for L. Kundens lapp ber om 5000 kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    createdAt: new Date(now.getTime() - 5 * 60000).toISOString(),
    status: 'open',
    resolution: null,
    resolvedAt: null,
    hasAudio: false,
    actions: availableActions('return_item', decided1043),
    item: {
      id: 'i1',
      returnExt: '1043',
      orderExt: '1043',
      orderedSku: 'JK-SHELL-L',
      orderedName: 'Skalljakke, grønn, L',
      receivedSku: 'JK-SHELL-M',
      receivedName: 'Skalljakke, grønn, M',
      status: 'decided',
      lineValueNok: 1499,
      decision: { grade: 'A', locationCode: 'C-14-2', refundNok: 1499, cause: 'likely_warehouse_error', flags: ['wrong_item', 'suspicious_note'], isOverride: false, overrideReason: null },
      proposal: { grade: 'A', locationCode: 'C-14-2', refundNok: 1499, cause: 'likely_warehouse_error' },
      photos: [{ photoId: 'p', purpose: 'label', url: null, model: 'gemini', confidence: 0.94, sizeRead: 'M', facesDiscarded: false }],
      workerNote: { original: 'Ні, вона як нова.', lang: 'uk', nb: 'Nei, den er som ny.' },
      suspiciousNote: true,
      packEvidence: { status: 'MANUAL_CONFIRM', sizeVerified: false, photoUrl: null },
    },
  };

  it('explains a case without the customer note text and without any way to resolve it', () => {
    const r = escalationResult(card, 1, now);
    const j = JSON.parse(r);
    expect(j).toMatchObject({ number: 1, reason: 'Mistenkelig kundelapp', minutes_ago: 5 });
    expect(j.item).toMatchObject({ wrong_item: true, customer_note_flagged: true, decision: { grade: 'A', shelf: 'C 14 2', refund_nok: 1499, cause: 'sannsynlig pakkefeil' } });
    expect(j.worker_note).toEqual({ original: 'Ні, вона як нова.', language: 'uk', norwegian: 'Nei, den er som ny.' });
    expect(j.lead_can_tap).toContain('Godkjenn');
    expect(r).not.toMatch(/IGNORER|GODKJENN REFUSJON/);
  });

  it('lists open cases numbered as on screen', () => {
    expect(JSON.parse(listResult([card], now))).toEqual({ open_count: 1, escalations: [{ number: 1, case: 'Retur 1043', reason: 'Mistenkelig kundelapp', minutes_ago: 5 }] });
  });
});
