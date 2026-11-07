import { describe, expect, it } from 'vitest';
import type { PackCaptureResult } from '@/lib/pack/types';
import { confirmEarcon, packCaptureEarcon, returnFlagEarcon, scanEarcon } from './earcons';

const photo = { photoId: 'p', purpose: 'pack_check', url: null } as unknown as Extract<PackCaptureResult, { ok: true }>['photo'];
const withStatus = (status: string) => ({ ok: true, photo, decision: { status } }) as unknown as PackCaptureResult;

describe('station earcons', () => {
  it('chimes on a passed pack check and alerts on a wrong item', () => {
    expect(packCaptureEarcon(withStatus('VERIFIED'))).toBe('chime');
    expect(packCaptureEarcon(withStatus('MISMATCH'))).toBe('alert');
    expect(packCaptureEarcon(withStatus('NEEDS_LABEL_PHOTO'))).toBeNull();
    expect(packCaptureEarcon({ ok: false, reason: 'offline' } as PackCaptureResult)).toBeNull();
  });

  it('alerts on a scan of an item that is not in the order', () => {
    expect(scanEarcon({ kind: 'not_in_order', sku: 'HD-BLACK-M' })).toBe('alert');
    expect(scanEarcon({ kind: 'counted', sku: 'HD-NAVY-M' })).toBeNull();
  });

  it('plays done only on a confirmed return', () => {
    expect(confirmEarcon({ ok: true } as Parameters<typeof confirmEarcon>[0])).toBe('done');
    expect(confirmEarcon({ ok: false, error: 'offline' })).toBeNull();
  });

  it('alerts once when a photo raises a new red flag', () => {
    expect(returnFlagEarcon([], ['suspicious_note'])).toBe('alert');
    expect(returnFlagEarcon(['suspicious_note'], ['suspicious_note'])).toBeNull();
    expect(returnFlagEarcon(['suspicious_note'], ['suspicious_note', 'wrong_item'])).toBe('alert');
    expect(returnFlagEarcon([], ['late_return'])).toBeNull();
  });
});
