'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CameraControl } from '@/components/camera';
import type { ManualReason } from '@/lib/engine/types';
import type { StringKey } from '@/lib/i18n/strings';
import { evaluateOrder, linesNeedingLabel } from '@/lib/pack/inputs';
import type { PackCaptureResult, PackPort, PackView, ScanResult, SealResult } from '@/lib/pack/types';
import type { CaptureFailure } from '@/lib/returns/types';

export type PackCameraTarget = { purpose: 'pack_check' } | { purpose: 'label_closeup'; sku: string };
export type PackBusy = null | 'capture' | 'scan' | 'seal' | 'manual';
export interface PackNotice {
  tone: 'bad' | 'warn' | 'ok';
  key: StringKey;
}

const FAILURE_KEY: Record<CaptureFailure | 'already_sealed', StringKey> = {
  timeout: 'packTimeoutMsg',
  invalid: 'retakeInvalid',
  unavailable: 'packTimeoutMsg',
  face: 'faceInFrame',
  upload: 'uploadFailed',
  offline: 'offline',
  rate_limited: 'rateLimited',
  spend_cap: 'visionCappedPack',
  already_sealed: 'alreadySealed',
};

const SCAN_NOTICE: Record<ScanResult['kind'], PackNotice> = {
  counted: { tone: 'ok', key: 'scanCounted' },
  already_counted: { tone: 'warn', key: 'scanAlready' },
  not_in_order: { tone: 'bad', key: 'scanNotInOrder' },
  unknown_code: { tone: 'warn', key: 'scanUnknown' },
  error: { tone: 'bad', key: 'failed' },
};

const systemClock = () => new Date();

export function usePackStation(initial: PackView, port: PackPort, clock: () => Date = systemClock) {
  const [view, setView] = useState(initial);
  const [camera, setCamera] = useState<PackCameraTarget | null>(null);
  /** false = closed; null = open for any line; a SKU = opened from that line */
  const [scanner, setScanner] = useState<string | null | false>(false);
  const [busy, setBusy] = useState<PackBusy>(null);
  const [notice, setNotice] = useState<PackNotice | null>(null);
  const [manualReason, setManualReason] = useState<ManualReason | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const cameraControl = useRef<CameraControl | null>(null);

  const { decision, inputs } = useMemo(() => evaluateOrder(view, clock(), manualReason ?? undefined), [view, clock, manualReason]);
  const needLabel = useMemo(() => linesNeedingLabel(view, decision), [view, decision]);
  const sealed = view.committed !== null;
  const checked = inputs.photosTaken > 0 || view.scans.length > 0;
  const latestPhoto = useMemo(
    () => [...view.photos].filter((p) => !p.facesDiscarded).sort((a, b) => a.takenAt.localeCompare(b.takenAt)).at(-1) ?? null,
    [view.photos],
  );

  const capture = useCallback(
    async (target: PackCameraTarget, image: Blob | null): Promise<PackCaptureResult> => {
      setCamera(null);
      setBusy('capture');
      setNotice(null);
      setManualReason(null);
      const res = await port.capture(view.orderKey, target.purpose, image, target.purpose === 'label_closeup' ? target.sku : undefined);
      setBusy(null);
      const photo = res.photo;
      if (photo) setView((v) => ({ ...v, photos: [...v.photos, photo] }));
      if (!res.ok) setNotice({ tone: res.reason === 'face' ? 'warn' : 'bad', key: FAILURE_KEY[res.reason] });
      else if (target.purpose === 'label_closeup' && !res.photo.label?.sizeRead) setNotice({ tone: 'warn', key: 'retakeUnclear' });
      return res;
    },
    [port, view.orderKey],
  );

  const scan = useCallback(
    async (code: string): Promise<ScanResult> => {
      setBusy('scan');
      setNotice(null);
      setManualReason(null);
      const res = await port.scan(view.orderKey, code);
      setBusy(null);
      if (res.kind === 'counted') setView((v) => ({ ...v, scans: [...v.scans, res.sku] }));
      setNotice(
        res.kind === 'error'
          ? { tone: 'bad', key: res.error === 'offline' ? 'offline' : res.error === 'already_sealed' ? 'alreadySealed' : 'failed' }
          : SCAN_NOTICE[res.kind],
      );
      return res;
    },
    [port, view.orderKey],
  );

  /** P8: the worker picks why the camera cannot see it; the server confirms it is allowed. */
  const chooseManual = useCallback(
    async (reason: ManualReason | null) => {
      setNotice(null);
      if (!reason) return setManualReason(null);
      setBusy('manual');
      const d = await port.manual(view.orderKey, reason);
      setBusy(null);
      if (d?.status === 'MANUAL_CONFIRM') setManualReason(reason);
      else setNotice({ tone: 'bad', key: 'failed' });
    },
    [port, view.orderKey],
  );

  const seal = useCallback(async (): Promise<SealResult> => {
    setBusy('seal');
    setNotice(null);
    const res = await port.seal(view.orderKey, decision.status === 'MANUAL_CONFIRM' ? (manualReason ?? undefined) : undefined);
    setBusy(null);
    if (!res.ok) {
      setNotice({ tone: 'bad', key: res.error === 'offline' ? 'offline' : res.error === 'already_sealed' ? 'alreadySealed' : 'failed' });
      return res;
    }
    setScanner(false);
    setCamera(null);
    setView((v) => ({ ...v, committed: res.committed, order: { ...v.order, status: 'packed' } }));
    return res;
  }, [decision.status, manualReason, port, view.orderKey]);

  return {
    view,
    decision,
    inputs,
    needLabel,
    sealed,
    checked,
    latestPhoto,
    camera,
    scanner,
    busy,
    notice,
    manualReason,
    countdown,
    cameraControl,
    port,
    actions: {
      capture,
      scan,
      seal,
      chooseManual,
      setNotice,
      setCountdown,
      openCamera: (target: PackCameraTarget) => {
        setScanner(false);
        setNotice(null);
        setCamera(target);
      },
      closeCamera: () => setCamera(null),
      openScanner: (sku: string | null = null) => {
        setCamera(null);
        setScanner(sku);
      },
      closeScanner: () => setScanner(false),
      reset: (v: PackView) => {
        setView(v);
        setCamera(null);
        setScanner(false);
        setBusy(null);
        setNotice(null);
        setManualReason(null);
        setCountdown(null);
      },
    },
  };
}

export type PackStation = ReturnType<typeof usePackStation>;
