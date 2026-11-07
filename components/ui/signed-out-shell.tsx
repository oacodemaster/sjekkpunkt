import type { ReactNode } from 'react';
import { Wordmark } from './wordmark';

/**
 * Sign-in, device picker, first launch and privacy: a white card on the graphite ground, like the
 * handheld in its device frame. The card is a light surface (ink focus ring); the ground is dark.
 */
export function SignedOutShell({ children, wide, lang }: { children: ReactNode; wide?: boolean; lang?: string }) {
  return (
    <main className="sp-dark flex flex-1 justify-center bg-surface px-0 sm:bg-frame sm:px-4 sm:py-8" lang={lang}>
      <div className={`sp-light flex w-full ${wide ? 'max-w-[34rem]' : 'max-w-md'} flex-col gap-6 self-start bg-surface p-4 text-ink sm:rounded-xl sm:p-6 sm:shadow-device`}>
        <Wordmark surface="light" size={32} nameSize={22} />
        {children}
      </div>
    </main>
  );
}
