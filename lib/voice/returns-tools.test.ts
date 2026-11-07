import { describe, expect, it } from 'vitest';
import { DEMO_NOW } from '@/lib/demo/seed';
import { demoReturnView } from '@/lib/demo/store';
import { NOTE_TEXT_1043, RET_1043_FRONT, RET_1043_LABEL, RET_1043_NOTE } from '@/lib/demo/visionFixtures';
import type { PhotoPurpose, ReturnInspection } from '@/lib/engine/types';
import { previewItem } from '@/lib/returns/preview';
import type { StationPhoto } from '@/lib/returns/types';
import { EL_LANG, fromElLang, RETURNS_TOOLS } from './agent-config';
import { capturePhotoResult, decisionSummary, getReturnResult, ToolParams, withPhoto, withWorker, workerPatch } from './returns-tools';

const now = new Date(DEMO_NOW);
const shot = (purpose: PhotoPurpose, inspection: ReturnInspection, min = 1): StationPhoto => ({
  photoId: `${purpose}-${min}`,
  purpose,
  url: null,
  takenAt: new Date(now.getTime() + min * 60_000).toISOString(),
  inspection,
  facesDiscarded: false,
});

describe('returns agent tools', () => {
  it('every configured tool has a parameter schema, and the reverse', () => {
    expect(RETURNS_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(ToolParams).sort());
  });

  it('get_return says what was ordered, the reason, the evidence and the photos needed', () => {
    const view = demoReturnView();
    const r = JSON.parse(getReturnResult(view, view.items[0], now));
    expect(r.return_number).toBe('1043');
    expect(r.items[0].ordered.name_en).toMatch(/jacket/i);
    expect(r.customer_reason_nb).toBeTruthy();
    expect(r.packing_evidence).toBe('manually confirmed at packing, size not read');
    expect(r.required_photos).toEqual(['front', 'label']);
    expect(r.photos_taken).toEqual([]);
  });

  it('a label photo result carries the size read and the next step from the engine', () => {
    const view = withPhoto(demoReturnView(), demoReturnView().items[0].id, shot('front', RET_1043_FRONT, 1));
    const id = view.items[0].id;
    const r = JSON.parse(capturePhotoResult(view, id, 'label', { ok: true, photo: shot('label', RET_1043_LABEL, 2) }, now));
    expect(r.ok).toBe(true);
    expect(r.read.size_read).toBe('M');
    expect(r.after.wrong_item_received).toBe(true);
    expect(r.after.likely_cause).toBe('likely_warehouse_error');
    expect(r.after.grade).toBe('A');
    expect(r.after.shelf).toBe('C 14 2'); // spoken form: a dash would be read aloud
    expect(r.after.can_confirm).toBe(true);
  });

  it('never passes the text of a customer note to the agent (LLM01)', () => {
    const base = demoReturnView();
    const id = base.items[0].id;
    let view = withPhoto(base, id, shot('front', RET_1043_FRONT, 1));
    view = withPhoto(view, id, shot('label', RET_1043_LABEL, 2));
    const out = capturePhotoResult(view, id, 'customer_note', { ok: true, photo: shot('customer_note', RET_1043_NOTE, 3) }, now);
    const r = JSON.parse(out);
    expect(out).not.toContain('5000');
    expect(out).not.toContain(NOTE_TEXT_1043);
    expect(out).not.toMatch(/IGNORER|GODKJENN/i);
    expect(r.read.contains_instructions).toBe(true);
    expect(r.after.customer_note).toEqual({ present: true, contains_instructions: true });
    // The engine, not the note, sets the refund.
    expect(r.after.refund_nok).toBe(1499);
    expect(r.after.goes_to_team_lead).toContain('suspicious_note');
  });

  it('a failed capture gives the agent a line to say and keeps the previous state', () => {
    const view = demoReturnView();
    const r = JSON.parse(capturePhotoResult(view, view.items[0].id, 'label', { ok: false, reason: 'face' }, now));
    expect(r.ok).toBe(false);
    expect(r.say).toMatch(/face/i);
    expect(r.after.status).toBe('needs_photos');
  });

  it('worker voice input only makes the condition worse', () => {
    expect(workerPatch({ stains: 'minor', tags_attached: true })).toEqual({ stains: 'minor' });
    expect(workerPatch({ tags_attached: false })).toEqual({ tagsAttached: false });
    const base = demoReturnView();
    const id = base.items[0].id;
    let view = withPhoto(base, id, shot('front', RET_1043_FRONT, 1));
    view = withPhoto(view, id, shot('label', RET_1043_LABEL, 2));
    view = withWorker(view, id, { stains: 'minor' });
    const d = decisionSummary(view, previewItem(view, view.items[0], now).decision);
    expect(d.grade).toBe('B');
    expect(d.shelf).toBe('B OUT 1');
  });

  it('rejects tool calls with unknown values', () => {
    expect(ToolParams.capture_photo.safeParse({ purpose: 'selfie' }).success).toBe(false);
    expect(ToolParams.show_step.safeParse({ step: 'admin' }).success).toBe(false);
    expect(ToolParams.evaluate_return.safeParse({ stains: 'huge' }).success).toBe(false);
    expect(ToolParams.select_item.safeParse({ item_number: 0 }).success).toBe(false);
  });

  it('maps app languages to ElevenLabs codes and back', () => {
    expect(EL_LANG.nb).toBe('no');
    expect(fromElLang('no')).toBe('nb');
    expect(fromElLang('uk')).toBe('uk');
    expect(fromElLang('pt-br')).toBeNull();
  });
});
