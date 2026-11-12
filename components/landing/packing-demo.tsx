'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PackStationView } from '@/components/pack/pack-station';
import { usePackStation } from '@/components/pack/use-pack-station';
import { Button, Icon } from '@/components/ui';
import { earconSrc, playEarcon, playLine, preloadAudio, stopLine } from '@/lib/audio/player';
import { EARCONS } from '@/lib/demo/audio';
import { PACK_SCENE, type DemoStep } from '@/lib/demo/script';
import { createDemoStore, type DemoState } from '@/lib/demo/store';
import type { Lang } from '@/lib/engine/types';
import type { LandingCopy, LandingLang } from '@/lib/landing/copy';

/**
 * The landing page's packing check (landing page brief, section 7): order 2207 on the real
 * packing station, on the demo adapter (in-memory seed, scripted vision fixtures, the real
 * engine). Nothing here calls an API: no vision, no voice, no translation, no database. The coach's
 * lines are the pre-generated files in public/audio, and nothing plays until the visitor turns
 * the sound on.
 *
 * Six steps, driven by Next or by the station's own buttons (whichever is further along wins):
 * the order, the packer speaks Polish, the coach reads the order, the check catches the black
 * hoodie, the swap checks out, seal.
 */

const line = (id: string) => PACK_SCENE.find((s) => s.id === id)!;
interface Step {
  /** what the coach or the packer says (from the scripted run) */
  say?: DemoStep;
  /** the earcon with the step */
  earcon?: DemoStep['earcon'];
  /** what the step does at the station */
  act?: 'check' | 'seal';
}
const STEPS: Step[] = [
  { say: line('PACK-01') },
  { say: line('PACK-02') },
  { say: line('PACK-03') },
  { say: line('PACK-05'), earcon: 'alert', act: 'check' },
  { say: line('PACK-07'), earcon: 'chime', act: 'check' },
  { earcon: 'done', act: 'seal' },
];
const LAST = STEPS.length - 1;
/** The packer speaks Polish from PACK-02 on; before that the station is in Norwegian. */
const stationLang = (i: number): Lang => (i >= 1 ? 'pl' : 'nb');
const lineSrc = (id: string) => `/audio/${id}.mp3`;
const HAS_AUDIO = new Set(['PACK-01', 'PACK-03', 'PACK-05', 'PACK-07']);
const tick = () => new Promise((r) => setTimeout(r, 30));

export default function PackingDemo({ lang, copy }: { lang: LandingLang; copy: LandingCopy['try'] }) {
  const store = useMemo(() => createDemoStore(), []);
  const state = useSyncExternalStore<DemoState>(store.subscribe, store.getState, store.getState);
  const station = usePackStation(state.packView, store.packPort, store.now);
  const stationRef = useRef(station);
  useEffect(() => {
    stationRef.current = station;
  });

  /** The furthest step reached with Next; the station's own taps can move further. */
  const [scripted, setScripted] = useState(0);
  const [sound, setSound] = useState(false);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  const screen = useRef<HTMLDivElement>(null);

  const photos = state.packView.photos.filter((p) => p.purpose === 'pack_check').length;
  const fromStation = state.packView.committed ? 5 : photos >= 2 ? 4 : photos === 1 ? 3 : 0;
  const step = Math.max(scripted, fromStation);
  const current = STEPS[step];

  /** The step's sound: the earcon, then the coach's line once the earcon has rung out. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silence = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stopLine();
  }, []);
  const play = useCallback(
    (i: number) => {
      silence();
      const s = STEPS[i];
      if (s.earcon) playEarcon(s.earcon, false);
      const id = s.say?.id;
      if (!id || !HAS_AUDIO.has(id)) return;
      const wait = s.earcon ? EARCONS[s.earcon].seconds * 1000 : 0;
      timer.current = setTimeout(() => void playLine(lineSrc(id), false), wait);
    },
    [silence],
  );

  // A new step plays its sound when the sound is on, whether Next or the station got it there.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    if (sound) play(step);
    // Keep the station's top (the verdict) in view inside the frame.
    screen.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [step, sound, play]);
  useEffect(() => () => silence(), [silence]);

  const act = useCallback(
    async (s: Step, live: boolean) => {
      const st = stationRef.current;
      if (s.act === 'check') {
        store.setCaptureDelay(live ? 1200 : 0);
        await st.actions.capture({ purpose: 'pack_check' }, null);
        store.setCaptureDelay(0);
      } else if (s.act === 'seal') {
        await st.actions.seal();
      }
      await tick();
    },
    [store],
  );

  /** Back to order 2207 as it was loaded, then replay up to `to` without sound or delay. */
  const replay = useCallback(
    async (to: number) => {
      silence();
      store.reset();
      await tick();
      stationRef.current.actions.reset(store.getState().packView);
      await tick();
      for (let k = 1; k <= to; k++) await act(STEPS[k], false);
      shown.current = to;
      setScripted(to);
    },
    [act, silence, store],
  );

  const run = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    try {
      await fn();
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };

  const next = () =>
    run(async () => {
      if (step >= LAST) return;
      const to = step + 1;
      // A check shows its verdict and the coach's answer together, when the photo is back.
      if (STEPS[to].act) await act(STEPS[to], true);
      setScripted(to);
    });
  const back = () => run(() => replay(Math.max(0, step - 1)));
  const restart = () => run(() => replay(0));
  const toggleSound = () => {
    if (sound) {
      silence();
      setSound(false);
      return;
    }
    // The files load only now, never before the visitor asks for sound.
    preloadAudio([...(['alert', 'chime', 'done'] as const).map(earconSrc), ...[...HAS_AUDIO].map(lineSrc)]);
    setSound(true);
    play(step);
  };

  const say = current.say;
  const caption = say ? (lang === 'en' ? say.captionEn : say.captionNb) : undefined;
  const showOriginal = say && say.lang !== lang;
  const done = step === LAST && !!state.packView.committed;

  return (
    <div className="lp-demo" data-testid="landing-demo" data-step={step}>
      <div className="lp-demo__panel">
        <p className="lp-demo__progress sp-mono" data-testid="demo-progress">
          {copy.progress.replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
          {running && <span className="sp-sr"> …</span>}
        </p>
        <h3 className="lp-demo__title">{copy.stepTitles[step]}</h3>
        <div className="lp-demo__say" aria-live="polite" data-testid="demo-caption">
          {say ? (
            <>
              <span className="lp-demo__who">{say.speaker === 'worker' ? copy.packer : copy.coach}</span>
              {showOriginal && (
                <span className="lp-demo__orig" lang={say.lang}>
                  {say.line}
                </span>
              )}
              <span className="lp-demo__tr">{showOriginal ? caption : say.line}</span>
            </>
          ) : (
            done && (
              <span className="lp-demo__end" data-testid="demo-end">
                <Icon name="ok" />
                {copy.end}
              </span>
            )
          )}
        </div>
        <div className="lp-demo__controls">
          <Button variant="on-dark" onClick={back} disabled={step === 0 || running} data-testid="demo-back">
            <Icon name="arrow-right" className="rotate-180" />
            {copy.back}
          </Button>
          {step < LAST ? (
            <Button variant="on-dark" iconAfter="arrow-right" className="lp-btn-light" onClick={next} disabled={running} data-testid="demo-next">
              {copy.next}
            </Button>
          ) : (
            <Button variant="on-dark" className="lp-btn-light" onClick={restart} disabled={running} data-testid="demo-restart">
              {copy.restart}
            </Button>
          )}
        </div>
        <div className="lp-demo__more">
          <button type="button" className="lp-demo__link" onClick={toggleSound} aria-pressed={sound} data-testid="demo-sound">
            {sound ? copy.soundOff : copy.soundOn}
          </button>
          {step > 0 && step < LAST && (
            <button type="button" className="lp-demo__link" onClick={restart} disabled={running}>
              {copy.restart}
            </button>
          )}
        </div>
      </div>

      <div className="sp-device lp-demo__device">
        <div ref={screen} className="sp-handheld sp-light lp-demo__screen" role="region" aria-label={copy.stationLabel} data-testid="demo-station">
          <PackStationView station={station} lang={stationLang(step)} captureMode="fixture" headingLevel={3} />
        </div>
      </div>
    </div>
  );
}
