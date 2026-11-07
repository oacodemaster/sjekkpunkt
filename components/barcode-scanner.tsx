'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';
import { Banner, Button, Card, Field, Icon } from '@/components/ui';

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
    <Card eyebrow={<><Icon name="barcode" />{t('barcode', lang)}</>} title={title} data-testid="barcode-scanner">
      {camera === 'on' && (
        <div className="sp-stage">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-[4px]">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
          </div>
        </div>
      )}
      {camera === 'denied' && (
        <Banner tone="error" role="alert">
          {t('cameraDenied', lang)}
        </Banner>
      )}
      {canDetect && camera !== 'denied' && (
        <Button variant="secondary" block icon={camera === 'on' ? undefined : 'camera'} onClick={() => setCamera((c) => (c === 'on' ? 'off' : 'on'))}>
          {camera === 'on' ? t('cancel', lang) : t('scanCamera', lang)}
        </Button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim() || busy) return;
          onCode(code.trim());
          setCode('');
        }}
      >
        <Field
          id="barcode-input"
          label={t('barcodePlaceholder', lang)}
          srLabel
          mono
          autoComplete="off"
          inputMode="text"
          placeholder={t('barcodePlaceholder', lang)}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          action={
            <Button type="submit" disabled={busy || !code.trim()}>
              OK
            </Button>
          }
        />
      </form>
      <Button variant="quiet" onClick={onClose}>
        {t('done', lang)}
      </Button>
    </Card>
  );
}
