'use client';

import { useCallback, useMemo, useState } from 'react';
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
import { EL_LANG, fromElLang } from '@/lib/voice/agent-config';
import { playEarcon } from '@/lib/audio/player';

// The voice dock shared by the stations: session start (mic check, token, language override),
// push-to-talk and hands-free, captions, and the language chip. Each station registers its own
// client tools next to it (useTool). Voice is an extra: every step still has its button, and mic
// denial or an unavailable service leaves tap-only mode.

/** Copied from @elevenlabs/client/worklets; lib/security/csp.test.ts fails if they drift. */
export const WORKLET_PATHS = {
  rawAudioProcessor: '/elevenlabs/rawAudioProcessor.js',
  audioConcatProcessor: '/elevenlabs/audioConcatProcessor.js',
};

export type VoiceState = 'off' | 'connecting' | 'on' | 'mic_denied' | 'unavailable' | 'capped' | 'rate_limited';

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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function waitFor<T>(fn: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  return null;
}

/**
 * Registers one client tool. Bad input or a crash becomes a short error the agent can say.
 * A soft tick tells the worker the coach is doing something on screen (brief appendix C).
 */
export function useTool(name: string, run: (params: unknown) => Promise<string> | string) {
  useConversationClientTool(name, async (params: Record<string, unknown>) => {
    playEarcon('tool');
    try {
      return await run(params);
    } catch (e) {
      console.error(`[voice] tool ${name} failed`, e);
      return JSON.stringify({ error: 'failed', say: 'Something went wrong. Ask the worker to use the buttons.' });
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
 * Must sit inside a ConversationProvider. `dynamicVariables` fill the agent prompt (for example
 * {return_number}); `firstMessage` is the greeting in the start language.
 */
export function VoiceDock({
  station,
  dynamicVariables,
  firstMessage,
  lang,
  onLangChange,
  onWorkerLine,
  talk,
  setTalk,
  handsFree,
  setHandsFree,
  languages = LANGS,
}: {
  station: 'return' | 'pack' | 'lead';
  dynamicVariables: Record<string, string>;
  firstMessage: (lang: Lang) => string;
  /** the worker's current language: starts from preferred_lang, flips when the agent switches */
  lang: Lang;
  onLangChange: (l: Lang) => void;
  /** every final worker line from speech to text (not the agent's paraphrase) */
  onWorkerLine?: (text: string) => void;
  talk: boolean;
  setTalk: (v: boolean) => void;
  handsFree: boolean;
  setHandsFree: (v: boolean) => void;
  /** languages offered on the chip (the lead assistant speaks Norwegian only) */
  languages?: readonly Lang[];
}) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  /** problems before or while connecting; once connected, the SDK status is the truth */
  const [issue, setIssue] = useState<null | 'connecting' | 'mic_denied' | 'unavailable' | 'capped' | 'rate_limited'>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [target, setTarget] = useState<CaptionTarget>(lang === 'nb' ? 'en' : 'nb');
  const captions = useCaptions(target);
  const connected = status === 'connected';
  const state: VoiceState = connected ? 'on' : status === 'error' ? 'unavailable' : (issue ?? 'off');
  const langRef = useLatest(lang);
  const varsRef = useLatest(dynamicVariables);
  const firstRef = useLatest(firstMessage);
  const workerLineRef = useLatest(onWorkerLine);

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
          body: JSON.stringify({ station }),
        });
        if (res.status === 429) return setIssue('rate_limited');
        if (res.status === 503 && ((await res.json().catch(() => ({}))) as { error?: string }).error === 'spend_cap') return setIssue('capped');
        if (!res.ok) throw new Error(String(res.status));
        ({ token, keyterms } = (await res.json()) as { token: string; keyterms: string[] });
      } catch {
        setIssue('unavailable');
        return;
      }
      captions.clear();
      startSession({
        conversationToken: token,
        connectionType: 'webrtc',
        // Self-hosted worklets: the CSP allows scripts from this origin only (no blob: or data:).
        workletPaths: WORKLET_PATHS,
        stripAudioTags: true,
        overrides: {
          agent: { language: EL_LANG[startLang] as Language, firstMessage: firstRef.current(startLang) },
          asr: { keywords: keyterms },
        },
        dynamicVariables: varsRef.current,
        onMessage: ({ message, role }) => {
          if (role === 'user') {
            if (message.startsWith('[screen]')) return;
            workerLineRef.current?.(message);
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
    [captions, firstRef, langRef, onLangChange, setHandsFree, startSession, station, varsRef, workerLineRef],
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
      {(state === 'capped' || state === 'rate_limited') && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-base text-warn" data-testid="voice-limit">
          {t(state === 'capped' ? 'voiceCapped' : 'rateLimited', lang)}
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
          {languages.map((l) => (
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
            disabled={state === 'connecting' || status === 'connecting' || state === 'capped'}
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
