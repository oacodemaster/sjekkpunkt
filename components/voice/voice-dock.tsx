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
import { Banner, Button, PushToTalk, VoiceOrb } from '@/components/ui';

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
  desk = false,
  tokenUrl = '/api/voice/token',
  connectContext,
}: {
  /** lead console: 48px desk controls on one row instead of the handheld's stacked 56px ones */
  desk?: boolean;
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
  /** where the conversation token comes from (the practice demo has its own public route) */
  tokenUrl?: string;
  /** a silent "[screen]" note sent once the session is up (the practice demo explains itself) */
  connectContext?: string;
}) {
  const { startSession, endSession, sendContextualUpdate } = useConversationControls();
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
  const connectContextRef = useLatest(connectContext);

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
        const res = await fetch(tokenUrl, {
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
        onConnect: () => {
          setIssue(null);
          if (connectContextRef.current) sendContextualUpdate(connectContextRef.current);
        },
        onError: (message) => {
          console.error('[voice]', message);
          setIssue('unavailable');
        },
      });
    },
    [captions, connectContextRef, firstRef, langRef, onLangChange, sendContextualUpdate, setHandsFree, startSession, station, tokenUrl, varsRef, workerLineRef],
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
    <div className={desk && !connected ? 'flex flex-wrap items-center gap-3' : 'flex flex-col gap-3'} data-testid="voice-dock" data-voice={state}>
      {/* Voice is optional, so losing it is information, not an error: the calm info banner. */}
      {state === 'mic_denied' && (
        <Banner role="alert" icon="mic-off">
          {t('micDenied', lang)}
        </Banner>
      )}
      {(state === 'capped' || state === 'rate_limited') && (
        <Banner role="alert" icon="mic-off" data-testid="voice-limit">
          {t(state === 'capped' ? 'voiceCapped' : 'rateLimited', lang)}
        </Banner>
      )}
      {state === 'unavailable' && (
        <Banner role="alert" icon="mic-off">
          {t('voiceUnavailable', lang)}
        </Banner>
      )}

      {connected && showCaptions && (
        <div className="max-h-[32vh] overflow-y-auto">
          <CaptionList lines={captions.lines} lang={lang} target={target} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="sp-sr" htmlFor="voice-lang">
          {t('language', lang)}
        </label>
        <select
          id="voice-lang"
          value={lang}
          onChange={(e) => pickLang(e.target.value as Lang)}
          className={`sp-input w-auto flex-[0_1_auto] font-semibold ${desk ? 'sp-input--desk' : 'py-2 text-[18px]'}`}
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
            <button type="button" onClick={() => setShowCaptions((v) => !v)} aria-pressed={showCaptions} className="sp-seg__opt flex-[0_1_auto]">
              {t('captions', lang)}
            </button>
            <button type="button" onClick={toggleTarget} className="sp-seg__opt sp-mono flex-[0_1_auto]" aria-label={t('captions', lang)}>
              {target.toUpperCase()}
            </button>
            <button type="button" onClick={toggleHandsFree} aria-pressed={handsFree} className="sp-seg__opt flex-[0_1_auto]">
              {t('handsFree', lang)}
            </button>
          </>
        )}
      </div>

      {connected ? (
        <div className="flex flex-wrap items-stretch gap-2">
          {handsFree ? (
            <div className="flex min-h-[76px] flex-[1_1_auto] items-center justify-center rounded-lg border-2 border-line px-4">
              <VoiceOrb state={isSpeaking ? 'speaking' : 'listening'} label={statusText} />
            </div>
          ) : (
            <span className="flex flex-[1_1_auto]">
              <PushToTalk
                main={talk ? t('voiceListening', lang) : isSpeaking ? t('voiceSpeaking', lang) : t('pushToTalk', lang)}
                pressed={talk}
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
                data-testid="push-to-talk"
              />
            </span>
          )}
          <Button variant="quiet" className="flex-[0_1_auto]" onClick={stop}>
            {t('voiceStop', lang)}
          </Button>
        </div>
      ) : (
        <div className={desk ? 'flex flex-wrap items-center gap-3' : 'flex flex-col gap-2'}>
          <Button
            variant="secondary"
            block={!desk}
            desk={desk}
            icon="mic"
            disabled={state === 'connecting' || status === 'connecting' || state === 'capped'}
            onClick={() => void start(lang)}
            data-testid="voice-start"
          >
            {state === 'connecting' || status === 'connecting' ? t('voiceConnecting', lang) : t('voiceStart', lang)}
          </Button>
          <p className={`m-0 text-[16px] leading-[22px] text-ink-2 ${desk ? '' : 'text-center'}`}>{t('tapOnlyHint', lang)}</p>
        </div>
      )}
    </div>
  );
}
