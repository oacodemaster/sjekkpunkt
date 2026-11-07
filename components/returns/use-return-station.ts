'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { PhotoPurpose, ReturnDecision, WorkerInput } from '@/lib/engine/types';
import type { StringKey } from '@/lib/i18n/strings';
import { previewItem } from '@/lib/returns/preview';
import type { CaptureFailure, ReturnItemState, ReturnsPort, ReturnView } from '@/lib/returns/types';

export type Phase = 'overview' | 'photos' | 'findings' | 'decision' | 'done';
export type Busy = null | 'capture' | 'confirm' | 'escalate';
export interface Notice {
  tone: 'bad' | 'warn' | 'ok';
  key: StringKey;
}

const FAILURE_KEY: Record<CaptureFailure, StringKey> = {
  timeout: 'retakeTimeout',
  invalid: 'retakeInvalid',
  unavailable: 'retakeTimeout',
  face: 'faceInFrame',
  upload: 'uploadFailed',
  offline: 'offline',
  rate_limited: 'failed',
};

export function stepsFor(decision: ReturnDecision): { purpose: PhotoPurpose; optional: boolean }[] {
  const req = decision.requiredPhotos.map((p) => ({ purpose: p, optional: false }));
  const extra: PhotoPurpose[] = ['damage', 'customer_note'];
  return [...req, ...extra.filter((p) => !decision.requiredPhotos.includes(p)).map((p) => ({ purpose: p, optional: true }))];
}

const systemClock = () => new Date();

export function useReturnStation(initial: ReturnView, port: ReturnsPort, clock: () => Date = systemClock) {
  const [view, setView] = useState(initial);
  const firstOpen = initial.items.findIndex((i) => i.status !== 'decided' && i.status !== 'escalated');
  const [itemIdx, setItemIdx] = useState(firstOpen >= 0 ? firstOpen : 0);
  const [phase, setPhase] = useState<Phase>(firstOpen >= 0 ? 'overview' : 'done');
  const [activeStep, setActiveStep] = useState<PhotoPurpose>('front');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const evalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWorker = useRef<{ id: string; worker: WorkerInput } | null>(null);

  const item = view.items[itemIdx];
  const { decision, retakes } = useMemo(() => previewItem(view, item, clock()), [view, item, clock]);
  const steps = useMemo(() => stepsFor(decision), [decision]);

  const patchItem = useCallback((id: string, fn: (i: ReturnItemState) => ReturnItemState) => {
    setView((v) => ({ ...v, items: v.items.map((i) => (i.id === id ? fn(i) : i)) }));
  }, []);

  const start = useCallback(() => {
    setPhase('photos');
    setActiveStep(decision.missingPhotos[0] ?? 'front');
    setNotice(null);
  }, [decision.missingPhotos]);

  const selectStep = useCallback((p: PhotoPurpose) => {
    setPhase('photos');
    setActiveStep(p);
    setNotice(null);
  }, []);

  const capture = useCallback(
    async (purpose: PhotoPurpose, image: Blob | null) => {
      setCameraOpen(false);
      setBusy('capture');
      setNotice(null);
      const id = item.id;
      const res = await port.capture(id, purpose, image);
      setBusy(null);
      const photo = res.photo;
      if (photo) patchItem(id, (i) => ({ ...i, status: i.status === 'pending' ? 'inspecting' : i.status, photos: [...i.photos, photo] }));
      if (!res.ok) {
        setNotice({ tone: res.reason === 'face' ? 'warn' : 'bad', key: FAILURE_KEY[res.reason] });
        return res;
      }
      const ins = res.photo.inspection;
      const identifies = purpose === 'label' || purpose === 'front' || purpose === 'packaging';
      const confidenceMin = view.settings.returnConfidenceMin ?? 0.7;
      if (purpose === 'label' && identifies && (!ins?.sizeRead || ins.identityConfidence < confidenceMin)) {
        setNotice({ tone: 'warn', key: 'retakeUnclear' });
      }
      return res;
    },
    [item.id, port, patchItem, view.settings.returnConfidenceMin],
  );

  const setWorker = useCallback(
    (patch: Partial<WorkerInput>) => {
      const id = item.id;
      const base = pendingWorker.current?.id === id ? pendingWorker.current.worker : item.worker;
      const worker = { ...base, ...patch };
      pendingWorker.current = { id, worker };
      patchItem(id, (i) => ({ ...i, worker }));
      if (evalTimer.current) clearTimeout(evalTimer.current);
      // Persist the worker's input; the server recomputes its own preview from it.
      evalTimer.current = setTimeout(() => {
        evalTimer.current = null;
        pendingWorker.current = null;
        void port.evaluate(id, worker).then((d) => {
          if (!d) setNotice({ tone: 'bad', key: 'failed' });
        });
      }, 300);
    },
    [item.id, item.worker, patchItem, port],
  );

  const confirm = useCallback(async () => {
    // Flush input the worker just tapped, so the server reruns on the latest values.
    if (evalTimer.current) {
      clearTimeout(evalTimer.current);
      evalTimer.current = null;
    }
    const pending = pendingWorker.current;
    if (pending) {
      pendingWorker.current = null;
      await port.evaluate(pending.id, pending.worker);
    }
    setBusy('confirm');
    setNotice(null);
    const res = await port.confirm(item.id);
    setBusy(null);
    if (!res.ok) {
      setNotice({ tone: 'bad', key: res.error === 'offline' ? 'offline' : 'failed' });
      return res;
    }
    patchItem(item.id, (i) => ({ ...i, status: 'decided', committed: res.committed }));
    setView((v) => ({ ...v, status: res.returnStatus }));
    setPhase('done');
    return res;
  }, [item.id, patchItem, port]);

  const escalate = useCallback(
    async (note?: string) => {
      setBusy('escalate');
      setNotice(null);
      const res = await port.escalate(item.id, note);
      setBusy(null);
      if (!res.ok) {
        setNotice({ tone: 'bad', key: res.error === 'offline' ? 'offline' : 'failed' });
        return res;
      }
      patchItem(item.id, (i) => ({ ...i, status: 'escalated' }));
      setView((v) => ({ ...v, status: res.returnStatus }));
      setPhase('done');
      return res;
    },
    [item.id, patchItem, port],
  );

  const selectItem = useCallback(
    (idx: number) => {
      setItemIdx(idx);
      const it = view.items[idx];
      setPhase(it.status === 'decided' || it.status === 'escalated' ? 'done' : it.photos.length ? 'photos' : 'overview');
      setNotice(null);
      setCameraOpen(false);
    },
    [view.items],
  );

  const nextOpenItem = view.items.findIndex((i, k) => k !== itemIdx && i.status !== 'decided' && i.status !== 'escalated');

  return {
    view,
    item,
    itemIdx,
    decision,
    retakes,
    steps,
    phase,
    activeStep,
    cameraOpen,
    busy,
    notice,
    nextOpenItem,
    port,
    actions: {
      start,
      selectStep,
      capture,
      setWorker,
      confirm,
      escalate,
      selectItem,
      setPhase,
      openCamera: () => setCameraOpen(true),
      closeCamera: () => setCameraOpen(false),
      setNotice,
      reset: (v: ReturnView) => {
        if (evalTimer.current) clearTimeout(evalTimer.current);
        evalTimer.current = null;
        pendingWorker.current = null;
        setView(v);
        setItemIdx(0);
        setPhase('overview');
        setActiveStep('front');
        setCameraOpen(false);
        setBusy(null);
        setNotice(null);
      },
    },
  };
}

export type ReturnStation = ReturnType<typeof useReturnStation>;
