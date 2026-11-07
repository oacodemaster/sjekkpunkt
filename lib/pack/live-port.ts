'use client';

import type { ManualReason, PackDecision } from '@/lib/engine/types';
import type { CaptureFailure } from '@/lib/returns/types';
import { createClient } from '@/lib/supabase/client';
import type { PackCaptureResult, PackPhoto, PackPort, ScanResult, SealResult } from './types';

async function post<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 0, data: null };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
  } catch {
    return { status: 0, data: null };
  }
}

/** Live adapter: every call goes through the API routes; the server reruns the engine. */
export function livePackPort(): PackPort {
  return {
    mode: 'live',

    async capture(orderKey, purpose, image, sku): Promise<PackCaptureResult> {
      if (!image) return { ok: false, reason: 'upload' };
      const up = await post<{ photoId: string; path: string; token: string; error?: string }>('/api/photos/upload-url', {
        purpose,
        entityType: 'order',
        entityId: orderKey,
      });
      if (up.status === 0) return { ok: false, reason: 'offline' };
      if (up.status === 409) return { ok: false, reason: 'already_sealed' };
      if (up.status !== 200 || !up.data) return { ok: false, reason: 'upload' };

      const { error } = await createClient()
        .storage.from('photos')
        .uploadToSignedUrl(up.data.path, up.data.token, image, { contentType: 'image/jpeg' });
      if (error) return { ok: false, reason: 'upload' };

      const v = await post<{ ok: boolean; reason?: CaptureFailure; photo?: PackPhoto; decision?: PackDecision }>('/api/vision', {
        photoId: up.data.photoId,
        purpose,
        ...(sku ? { sku } : {}),
      });
      if (v.status === 0) return { ok: false, reason: 'offline' };
      if (v.status === 429) return { ok: false, reason: 'rate_limited' };
      if (v.status === 409) return { ok: false, reason: 'already_sealed' };
      if (v.status !== 200 || !v.data) return { ok: false, reason: 'unavailable' };
      if (v.data.ok && v.data.photo) return { ok: true, photo: v.data.photo, decision: v.data.decision };
      return { ok: false, reason: v.data.reason ?? 'unavailable', photo: v.data.photo, decision: v.data.decision };
    },

    async scan(orderKey, code): Promise<ScanResult> {
      const r = await post<{ result: ScanResult }>(`/api/pack/${orderKey}/barcode`, { code });
      if (r.status === 0) return { kind: 'error', error: 'offline' };
      if (r.status === 409) return { kind: 'error', error: 'already_sealed' };
      return r.status === 200 && r.data ? r.data.result : { kind: 'error', error: 'failed' };
    },

    async manual(orderKey, reason: ManualReason) {
      const r = await post<{ decision: PackDecision }>(`/api/pack/${orderKey}/manual`, { reason });
      return r.data?.decision ?? null;
    },

    async seal(orderKey, manualReason): Promise<SealResult> {
      // Only the worker's reason is sent: the server recomputes the decision (R16).
      const r = await post<SealResult & { error?: string; decision?: PackDecision }>(`/api/pack/${orderKey}/seal`, manualReason ? { manualReason } : {});
      if (r.status === 0) return { ok: false, error: 'offline' };
      if (r.status === 200 && r.data?.ok) return r.data;
      if (r.data?.error === 'not_ready') return { ok: false, error: 'not_ready', decision: r.data.decision };
      if (r.data?.error === 'already_sealed') return { ok: false, error: 'already_sealed' };
      return { ok: false, error: 'failed' };
    },
  };
}
