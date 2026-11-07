'use client';

import type { PhotoPurpose, ReturnDecision, WorkerInput } from '@/lib/engine/types';
import { createClient } from '@/lib/supabase/client';
import type { CaptureFailure, CaptureResult, ConfirmResult, EscalateResult, ReturnsPort, StationPhoto } from './types';

async function post<T>(url: string, body: unknown): Promise<{ status: number; data: T | null }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 0, data: null };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

/** Live adapter: every call goes through the API routes; the server reruns the engine. */
export function livePort(): ReturnsPort {
  return {
    mode: 'live',

    async capture(itemId, purpose: PhotoPurpose, image): Promise<CaptureResult> {
      if (!image) return { ok: false, reason: 'upload' };
      const up = await post<{ photoId: string; path: string; token: string }>('/api/photos/upload-url', {
        purpose,
        entityType: 'return_item',
        entityId: itemId,
      });
      if (up.status === 0) return { ok: false, reason: 'offline' };
      if (up.status !== 200 || !up.data) return { ok: false, reason: 'upload' };

      const { error } = await createClient()
        .storage.from('photos')
        .uploadToSignedUrl(up.data.path, up.data.token, image, { contentType: 'image/jpeg' });
      if (error) return { ok: false, reason: 'upload' };

      const v = await post<{ ok: boolean; reason?: CaptureFailure; photo?: StationPhoto }>('/api/vision', {
        photoId: up.data.photoId,
        purpose,
      });
      if (v.status === 0) return { ok: false, reason: 'offline' };
      if (v.status === 429) return { ok: false, reason: 'rate_limited' };
      if (v.status !== 200 || !v.data) return { ok: false, reason: 'unavailable' };
      if (v.data.ok && v.data.photo) return { ok: true, photo: v.data.photo };
      return { ok: false, reason: v.data.reason ?? 'unavailable', photo: v.data.photo };
    },

    async evaluate(itemId, worker: WorkerInput) {
      const r = await post<{ decision: ReturnDecision }>(`/api/returns/items/${itemId}/evaluate`, { worker });
      return r.status === 200 && r.data ? r.data.decision : null;
    },

    async confirm(itemId): Promise<ConfirmResult> {
      // No decision fields are sent: the server recomputes everything (R16).
      const r = await post<ConfirmResult & { error?: string; decision?: ReturnDecision }>(`/api/returns/items/${itemId}/confirm`, {});
      if (r.status === 0) return { ok: false, error: 'offline' };
      if (r.status === 200 && r.data?.ok) return r.data;
      if (r.data?.error === 'not_ready') return { ok: false, error: 'not_ready', decision: r.data.decision };
      if (r.data?.error === 'already_decided') return { ok: false, error: 'already_decided' };
      return { ok: false, error: 'failed' };
    },

    async escalate(itemId, note): Promise<EscalateResult> {
      const r = await post<EscalateResult & { error?: string }>(`/api/returns/items/${itemId}/escalate`, note ? { note } : {});
      if (r.status === 0) return { ok: false, error: 'offline' };
      if (r.status === 200 && r.data?.ok) return r.data;
      return { ok: false, error: r.data?.error === 'already_decided' ? 'already_decided' : 'failed' };
    },
  };
}
