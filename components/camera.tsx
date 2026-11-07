'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { fileToJpeg, frameToJpeg } from '@/lib/camera/image';
import type { Lang } from '@/lib/engine/types';
import { t } from '@/lib/i18n/strings';
import { Button } from '@/components/ui';

export type CamState = 'starting' | 'live' | 'denied' | 'unavailable';

/** Lets the voice agent's capture_photo tool take the shot the shutter would take. */
export interface CameraControl {
  state: CamState;
  shoot: () => Promise<Blob | null>;
}

/**
 * Rear camera with a big shutter. Nothing is captured until the worker presses the shutter
 * or asks the voice coach to take the photo (push-to-talk), and the stream stops when the
 * component unmounts.
 */
export function Camera({
  lang,
  hint,
  onCapture,
  onCancel,
  controlRef,
  countdown,
}: {
  lang: Lang;
  hint: string;
  onCapture: (jpeg: Blob) => void;
  onCancel: () => void;
  controlRef?: RefObject<CameraControl | null>;
  /** seconds left before a voice-requested photo is taken */
  countdown?: number | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CamState>('starting');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
        setState('live');
      } catch (e) {
        const name = (e as DOMException)?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  async function shoot() {
    if (!video.current || !video.current.videoWidth) return;
    onCapture(await frameToJpeg(video.current));
  }

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      state,
      shoot: async () => (state === 'live' && video.current?.videoWidth ? frameToJpeg(video.current) : null),
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, state]);

  async function picked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onCapture(await fileToJpeg(f));
    e.target.value = '';
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="type-body m-0 font-semibold">{hint}</p>
      <div className="sp-stage">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[4px] bg-stage">
          <video ref={video} playsInline muted className={`h-full w-full object-cover ${state === 'live' ? '' : 'hidden'}`} />
          {state === 'live' && countdown != null && countdown > 0 && (
            <div className="sp-mono absolute inset-0 flex items-center justify-center text-[96px] font-bold text-ink-on-dark" aria-live="assertive">
              {countdown}
            </div>
          )}
          {state !== 'live' && (
            <div className="type-body absolute inset-0 flex items-center justify-center p-6 text-center text-ink-on-dark">
              {state === 'starting' && <span className="sp-busy border-line-on-dark bg-transparent text-ink-on-dark">…</span>}
              {state === 'denied' && <span role="alert">{t('cameraDenied', lang)}</span>}
              {state === 'unavailable' && <span role="alert">{t('cameraUnavailable', lang)}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {state === 'live' ? (
          <Button className="flex-[1_1_auto]" icon="camera" onClick={shoot} aria-label={t('takePhoto', lang)}>
            {t('takePhoto', lang)}
          </Button>
        ) : (
          <Button className="flex-[1_1_auto]" onClick={() => file.current?.click()}>
            {t('chooseFile', lang)}
          </Button>
        )}
        <Button variant="quiet" className="flex-[0_1_auto]" onClick={onCancel}>
          {t('cancel', lang)}
        </Button>
      </div>
      {state === 'live' && (
        <Button variant="quiet" onClick={() => file.current?.click()}>
          {t('chooseFile', lang)}
        </Button>
      )}
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} data-testid="photo-file" />
    </div>
  );
}
