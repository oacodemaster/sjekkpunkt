'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/engine/types';
import { t, type StringKey } from '@/lib/i18n/strings';
import { Banner, Button, Card, Field, Icon } from '@/components/ui';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

const noopSubscribe = () => () => {};

/** "Skann retur": QR via the browser's BarcodeDetector where available, number field always. */
export function ScanForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ key: StringKey; tone: 'bad' | 'warn' } | null>(null);
  const [scanning, setScanning] = useState(false);
  // BarcodeDetector exists only in some browsers; false during server rendering.
  const canScan = useSyncExternalStore(
    noopSubscribe,
    () => !!window.BarcodeDetector,
    () => false,
  );
  const video = useRef<HTMLVideoElement>(null);

  async function submit(value: string) {
    const v = value.trim();
    if (!v || busy) return;
    if (!navigator.onLine) return setMsg({ key: 'offline', tone: 'bad' });
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/returns/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: v }),
      });
      const data = await res.json();
      if (data.kind === 'found') router.push(`/return/${encodeURIComponent(data.extId)}`);
      else if (data.kind === 'unknown') setMsg({ key: 'unknownParcel', tone: 'warn' });
      else setMsg({ key: 'failed', tone: 'bad' });
    } catch {
      setMsg({ key: 'failed', tone: 'bad' });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!scanning || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play().catch(() => {});
        timer = setInterval(async () => {
          if (done || !video.current?.videoWidth) return;
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) {
            done = true;
            setScanning(false);
            setCode(found[0].rawValue);
            void submit(found[0].rawValue);
          }
        }, 300);
      } catch {
        setScanning(false);
        setMsg({ key: 'cameraDenied', tone: 'bad' });
      }
    })();
    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // submit is stable enough for a one-shot scan session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <Card eyebrow={<><Icon name="barcode" />{t('scanReturn', lang)}</>}>
      {scanning && (
        <div className="sp-stage">
          <div className="aspect-square w-full overflow-hidden rounded-[4px]">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
          </div>
        </div>
      )}
      {canScan && (
        <Button block icon={scanning ? undefined : 'camera'} variant={scanning ? 'secondary' : 'primary'} onClick={() => setScanning((s) => !s)}>
          {scanning ? t('cancel', lang) : t('scanCamera', lang)}
        </Button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <Field
          id="return-code"
          label={t('returnNumber', lang)}
          srLabel
          mono
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('returnNumber', lang)}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          help={t('scanHint', lang)}
          action={
            <Button type="submit" variant={canScan ? 'secondary' : 'primary'} disabled={busy || !code.trim()}>
              {t('open', lang)}
            </Button>
          }
        />
      </form>
      {msg && (
        <Banner tone={msg.tone === 'bad' ? 'error' : 'warn'} role="alert">
          {t(msg.key, lang)}
        </Banner>
      )}
    </Card>
  );
}
