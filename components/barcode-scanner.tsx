'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';

const noopSubscribe = () => () => {};

/**
 * Barcode fallback for packing (P7): the rear camera with the browser's BarcodeDetector where it
 * exists (Chrome on Android), and a typed field always. Each code is handed to `onCode` once;
 * the server decides whether it counts.
 */
export function BarcodeScanner({
  lang,
  title,
  busy,
  onCode,
  onClose,
}: {
  lang: Lang;
  title: string;
  busy: boolean;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState<'off' | 'on' | 'denied'>('off');
  const canDetect = useSyncExternalStore(noopSubscribe, () => !!window.BarcodeDetector, () => false);
  const video = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    if (camera !== 'on' || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let last = '';
    let lastAt = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        timer = setInterval(async () => {
          if (!video.current?.videoWidth) return;
          const found = await detector.detect(video.current).catch(() => []);
          const value = found[0]?.rawValue;
          // The same code is held in front of the camera for a while: hand it over once.
          if (value && (value !== last || Date.now() - lastAt > 2500)) {
            last = value;
            lastAt = Date.now();
            navigator.vibrate?.(60);
            onCodeRef.current(value);
          }
        }, 250);
      } catch {
        setCamera('denied');
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [camera]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent p-3" data-testid="barcode-scanner">
      <h3 className="text-lg font-bold">{title}</h3>
      {camera === 'on' && (
        <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
        </div>
      )}
      {camera === 'denied' && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-bad">
          {t('cameraDenied', lang)}
        </p>
      )}
      {canDetect && camera !== 'denied' && (
        <button className="btn-secondary" onClick={() => setCamera((c) => (c === 'on' ? 'off' : 'on'))}>
          {camera === 'on' ? t('cancel', lang) : t('scanCamera', lang)}
        </button>
      )}
      <form
        className="grid grid-cols-[1fr_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim() || busy) return;
          onCode(code.trim());
          setCode('');
        }}
      >
        <label className="sr-only" htmlFor="barcode-input">
          {t('barcodePlaceholder', lang)}
        </label>
        <input
          id="barcode-input"
          autoComplete="off"
          inputMode="text"
          className="min-h-14 min-w-0 rounded-xl border-2 border-gray-300 px-3 text-lg"
          placeholder={t('barcodePlaceholder', lang)}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="btn-primary" disabled={busy || !code.trim()}>
          OK
        </button>
      </form>
      <button className="text-base text-muted underline" onClick={onClose}>
        {t('done', lang)}
      </button>
    </div>
  );
}
