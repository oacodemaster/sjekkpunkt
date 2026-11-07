'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  useConversationClientTool,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
  type Language,
} from '@elevenlabs/react';
import { CaptionList, useCaptions, type CaptionTarget } from '@/components/voice/captions';
import type { Lang } from '@/lib/engine/types';
import { useLatest } from '@/lib/hooks/use-latest';
import { LANG_NAMES, LANGS, t } from '@/lib/i18n/strings';
import { previewItem } from '@/lib/returns/preview';
import { EL_LANG, FIRST_MESSAGES, fromElLang } from '@/lib/voice/agent-config';
import {
  cameraProblem,
  capturePhotoResult,
  decisionSummary,
  getReturnResult,
  PHOTO_PURPOSES,
  toolError,
  ToolParams,
  withWorker,
  workerPatch,
  type ToolName,
} from '@/lib/voice/returns-tools';
import type { ReturnStation } from './use-return-station';

export type VoiceState = 'off' | 'connecting' | 'on' | 'mic_denied' | 'unavailable';

/** What the station screen uses to tell the agent about taps (contextual updates). */
export interface VoiceLink {
  /** silent context; the agent does not answer */
  context: (text: string) => void;
  /** a turn the agent answers (used after confirm, so it moves on) */
  say: (text: string) => void;
}

/** The link for tap updates. Does nothing unless a conversation is connected. */
export function useVoiceLink(): VoiceLink {
  const { sendContextualUpdate, sendUserMessage } = useConversationControls();
  const { status } = useConversationStatus();
  const connected = useLatest(status === 'connected');
  return useMemo(
    () => ({
      context: (text: string) => {
        if (connected.current) sendContextualUpdate(text);
      },
      say: (text: string) => {
        if (connected.current) sendUserMessage(text);
      },
    }),
    [connected, sendContextualUpdate, sendUserMessage],
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  return null;
}

/** Registers one client tool. Bad input or a crash becomes a short error the agent can say. */
function useTool(name: ToolName, run: (params: unknown) => Promise<string> | string) {
  useConversationClientTool(name, async (params: Record<string, unknown>) => {
    try {
      return await run(params);
    } catch (e) {
      console.error(`[voice] tool ${name} failed`, e);
      return toolError('failed', 'Something went wrong. Ask the worker to use the buttons.');
    }
  });
}

const HANDS_FREE_KEY = 'sp_voice_hands_free';
const CAPTION_TARGET_KEY = 'sp_caption_target';
const readPref = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the preference is just not remembered */
  }
};

/**
 * Voice coach for the returns station. Must sit inside a ConversationProvider. Voice is an extra:
 * every step still has its button, and mic denial or an unavailable service leaves tap-only mode.
 */
export function ReturnVoice({
  station,
  lang,
  onLangChange,
  talk,
  setTalk,
  handsFree,
  setHandsFree,
}: {
  station: ReturnStation;
  /** the worker's current language: starts from preferred_lang, flips when the agent switches */
  lang: Lang;
  onLangChange: (l: Lang) => void;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
}) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  /** problems before or while connecting; once connected, the SDK status is the truth */
  const [issue, setIssue] = useState<null | 'connecting' | 'mic_denied' | 'unavailable'>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [target, setTarget] = useState<CaptionTarget>(lang === 'nb' ? 'en' : 'nb');
  const captions = useCaptions(target);
  const connected = status === 'connected';
  const state: VoiceState = connected ? 'on' : status === 'error' ? 'unavailable' : (issue ?? 'off');

  // Latest values for async tool handlers and session callbacks.
  const stationRef = useLatest(station);
  const langRef = useLatest(lang);
  const lastWorkerLine = useRef<string | null>(null);

  // ---------- client tools (names and parameters: lib/voice/agent-config.ts) ----------

  const itemDone = () => {
    const s = stationRef.current;
    return s.item.status === 'decided' || s.item.status === 'escalated';
  };

  useTool('get_return', () => {
    const s = stationRef.current;
    return getReturnResult(s.view, s.item, new Date());
  });

  useTool('show_step', (raw) => {
    const p = ToolParams.show_step.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    const s = stationRef.current;
    const step = p.data.step;
    if ((PHOTO_PURPOSES as readonly string[]).includes(step)) {
      if (itemDone()) return toolError('item_done', 'This item is already done.');
      s.actions.selectStep(step as (typeof PHOTO_PURPOSES)[number]);
      s.actions.openCamera();
    } else {
      s.actions.closeCamera();
      s.actions.setPhase(step === 'overview' ? 'overview' : (step as 'findings' | 'decision'));
    }
    return JSON.stringify({ ok: true, step });
  });

  useTool('capture_photo', async (raw) => {
    const p = ToolParams.capture_photo.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const purpose = p.data.purpose;
    const s = stationRef.current;
    const onStep = s.cameraOpen && s.activeStep === purpose;
    const aimed = onStep && s.cameraControl.current?.state === 'live';
    if (!onStep) {
      s.actions.selectStep(purpose);
      s.actions.openCamera();
    }
    const ctrl = await waitFor(() => {
      const c = stationRef.current.cameraControl.current;
      return c && c.state !== 'starting' ? c : null;
    }, 8000);
    if (!ctrl) return cameraProblem(purpose, stationRef.current.cameraOpen ? 'camera_unavailable' : 'cancelled');
    if (ctrl.state !== 'live') return cameraProblem(purpose, 'camera_unavailable');
    // The camera just opened: give the worker a visible moment to aim before the shot.
    if (!aimed) {
      for (const n of [2, 1]) {
        stationRef.current.actions.setCountdown(n);
        await sleep(800);
      }
      stationRef.current.actions.setCountdown(null);
    }
    const live = stationRef.current.cameraControl.current;
    if (!live) return cameraProblem(purpose, 'cancelled');
    const jpeg = await live.shoot();
    if (!jpeg) return cameraProblem(purpose, 'camera_unavailable');
    const cur = stationRef.current;
    const res = await cur.actions.capture(purpose, jpeg);
    return capturePhotoResult(cur.view, cur.item.id, purpose, res, new Date());
  });

  useTool('evaluate_return', async (raw) => {
    const p = ToolParams.evaluate_return.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const s = stationRef.current;
    // The note is stored as the worker spoke it (speech to text), not as the agent paraphrased it.
    const text = p.data.note ? (lastWorkerLine.current ?? p.data.note) : undefined;
    const { worker, decision } = await s.actions.applyWorker(workerPatch(p.data), text ? { text, lang: langRef.current } : undefined);
    const cur = stationRef.current;
    cur.actions.closeCamera();
    cur.actions.setPhase('decision');
    const view = withWorker(cur.view, cur.item.id, worker);
    const item = view.items.find((i) => i.id === cur.item.id)!;
    return JSON.stringify(decisionSummary(view, decision ?? previewItem(view, item, new Date()).decision));
  });

  useTool('select_item', (raw) => {
    const p = ToolParams.select_item.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    const s = stationRef.current;
    const idx = p.data.item_number - 1;
    const item = s.view.items[idx];
    if (!item) return toolError('no_such_item', `This return has ${s.view.items.length} items.`);
    s.actions.selectItem(idx);
    return getReturnResult(s.view, item, new Date());
  });

  useTool('escalate_to_lead', async (raw) => {
    const p = ToolParams.escalate_to_lead.safeParse(raw);
    if (!p.success) return toolError('bad_parameters');
    if (itemDone()) return toolError('item_done', 'This item is already done.');
    const res = await stationRef.current.actions.escalate(p.data.reason, langRef.current);
    return res.ok ? JSON.stringify({ sent_to_team_lead: true }) : toolError(res.error, 'It was not sent. Ask the worker to press "Send til teamleder".');
  });

  // ---------- session ----------

  const start = useCallback(
    async (startLang: Lang) => {
      setIssue('connecting');
      // Remembered per device: hands-free and the caption language.
      const hf = readPref(HANDS_FREE_KEY);
      if (hf !== null) setHandsFree(hf === '1');
      const ct = readPref(CAPTION_TARGET_KEY);
      if (ct === 'nb' || ct === 'en') setTarget(ct);
      // Ask for the mic first, so a denial lands in tap-only mode with a clear message.
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((tr) => tr.stop());
      } catch (e) {
        const name = (e as DOMException)?.name;
        setIssue(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic_denied' : 'unavailable');
        return;
      }
      let token: string;
      let keyterms: string[] = [];
      try {
        const res = await fetch('/api/voice/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ station: 'return' }),
        });
        if (!res.ok) throw new Error(String(res.status));
        ({ token, keyterms } = (await res.json()) as { token: string; keyterms: string[] });
      } catch {
        setIssue('unavailable');
        return;
      }
      const returnNumber = stationRef.current.view.ret.id;
      captions.clear();
      startSession({
        conversationToken: token,
        connectionType: 'webrtc',
        stripAudioTags: true,
        overrides: {
          agent: { language: EL_LANG[startLang] as Language, firstMessage: FIRST_MESSAGES[startLang].replace('{{return_number}}', returnNumber) },
          asr: { keywords: keyterms },
        },
        dynamicVariables: { return_number: returnNumber },
        onMessage: ({ message, role }) => {
          if (role === 'user') {
            if (message.startsWith('[screen]')) return;
            lastWorkerLine.current = message;
            captions.add('worker', message, null);
          } else {
            captions.add('agent', message, langRef.current);
          }
        },
        onAgentToolResponse: (r) => {
          // The language detection tool's full result carries the new language ({"language":"uk"}).
          if (r.tool_name !== 'language_detection' || !('full_tool_result' in r)) return;
          try {
            const next = fromElLang((JSON.parse(r.full_tool_result) as { language?: string }).language);
            if (next && next !== langRef.current) {
              langRef.current = next;
              onLangChange(next);
            }
          } catch {
            /* not JSON: keep the current language */
          }
        },
        onConnect: () => setIssue(null),
        onError: (message) => {
          console.error('[voice]', message);
          setIssue('unavailable');
        },
      });
    },
    [captions, langRef, onLangChange, setHandsFree, startSession, stationRef],
  );

  const stop = useCallback(() => {
    endSession();
    setTalk(false);
    setIssue(null);
  }, [endSession, setTalk]);

  // A language picked by hand restarts the conversation in that language.
  const pickLang = (l: Lang) => {
    if (l === lang) return;
    onLangChange(l);
    if (connected) {
      endSession();
      setTimeout(() => void start(l), 300);
    }
  };

  const toggleHandsFree = () => {
    const v = !handsFree;
    setHandsFree(v);
    writePref(HANDS_FREE_KEY, v ? '1' : '0');
  };
  const toggleTarget = () => {
    const v: CaptionTarget = target === 'nb' ? 'en' : 'nb';
    setTarget(v);
    writePref(CAPTION_TARGET_KEY, v);
  };

  const listening = connected && (handsFree || talk);
  const statusText = !connected ? null : isSpeaking ? t('voiceSpeaking', lang) : listening ? t('voiceListening', lang) : t('voiceReady', lang);

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-white/95 p-3 backdrop-blur" data-testid="voice-dock" data-voice={state}>
      {state === 'mic_denied' && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-base text-warn">
          {t('micDenied', lang)}
        </p>
      )}
      {state === 'unavailable' && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-base text-warn">
          {t('voiceUnavailable', lang)}
        </p>
      )}

      {connected && showCaptions && <CaptionList lines={captions.lines} lang={lang} />}

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="voice-lang">
          {t('language', lang)}
        </label>
        <select
          id="voice-lang"
          value={lang}
          onChange={(e) => pickLang(e.target.value as Lang)}
          className="min-h-12 rounded-full bg-slate-100 px-3 text-base font-semibold"
          data-testid="voice-lang"
        >
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()} · {LANG_NAMES[l]}
            </option>
          ))}
        </select>
        {connected && (
          <>
            <button
              onClick={() => setShowCaptions((v) => !v)}
              aria-pressed={showCaptions}
              className={`min-h-12 rounded-full px-3 text-sm font-semibold ${showCaptions ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}
            >
              {t('captions', lang)}
            </button>
            <button onClick={toggleTarget} className="min-h-12 rounded-full bg-slate-100 px-3 text-sm font-semibold" aria-label={t('captions', lang)}>
              {target.toUpperCase()}
            </button>
            <button
              onClick={toggleHandsFree}
              aria-pressed={handsFree}
              className={`min-h-12 rounded-full px-3 text-sm font-semibold ${handsFree ? 'bg-accent text-white' : 'bg-slate-100'}`}
            >
              {t('handsFree', lang)}
            </button>
          </>
        )}
      </div>

      {connected ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {handsFree ? (
            <div className={`flex min-h-16 items-center justify-center gap-3 rounded-2xl text-lg font-semibold ${isSpeaking ? 'bg-slate-100' : 'bg-blue-50 text-accent'}`}>
              <Orb active={isSpeaking || listening} speaking={isSpeaking} />
              {statusText}
            </div>
          ) : (
            <button
              className={`flex min-h-16 touch-none select-none items-center justify-center gap-3 rounded-2xl text-xl font-bold ${talk ? 'bg-accent text-white' : 'bg-blue-50 text-accent'}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setTalk(true);
              }}
              onPointerUp={() => setTalk(false)}
              onPointerCancel={() => setTalk(false)}
              onLostPointerCapture={() => setTalk(false)}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && setTalk(true)}
              onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && setTalk(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={talk}
              data-testid="push-to-talk"
            >
              <Orb active={isSpeaking || talk} speaking={isSpeaking} />
              {talk ? t('voiceListening', lang) : isSpeaking ? t('voiceSpeaking', lang) : t('pushToTalk', lang)}
            </button>
          )}
          <button className="btn-secondary min-h-16 px-4 text-base" onClick={stop}>
            {t('voiceStop', lang)}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            className="btn-secondary min-h-14 text-lg"
            disabled={state === 'connecting' || status === 'connecting'}
            onClick={() => void start(lang)}
            data-testid="voice-start"
          >
            🎙 {state === 'connecting' || status === 'connecting' ? t('voiceConnecting', lang) : t('voiceStart', lang)}
          </button>
          <p className="text-center text-sm text-muted">{t('tapOnlyHint', lang)}</p>
        </div>
      )}
    </div>
  );
}

/** Agent state at a glance: pulses while listening, solid while the agent speaks. */
function Orb({ active, speaking }: { active: boolean; speaking: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-5 w-5 rounded-full ${speaking ? 'bg-ok' : active ? 'animate-pulse bg-white ring-4 ring-blue-300' : 'bg-blue-300'}`}
    />
  );
}
