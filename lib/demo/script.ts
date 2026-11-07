// The scripted demo run (brief section 10). M2 covers scene 2 (returns); scene 1 (packing)
// arrives in M4 and scene 3 (the loop) in M5. Every step's effect runs the real engine
// through the demo adapter; only the camera and the model output are scripted.
// REVIEW: native speakers should check the uk lines before audio is generated (M9).

import type { Lang } from '@/lib/engine/types';

export type Speaker = 'agent' | 'worker' | 'system' | 'lead';
export type Earcon = 'chime' | 'alert' | 'shutter' | 'done';
export type DemoEffect =
  | 'loadReturn'
  | 'switchLang'
  | 'askLabel'
  | 'captureLabel'
  | 'labelFindings'
  | 'workerNoDamage'
  | 'showDecision'
  | 'captureNote'
  | 'flagNote'
  | 'confirm'
  | 'leadSummary';

export interface DemoStep {
  id: string;
  speaker: Speaker;
  lang?: Lang;
  line?: string;
  captionEn?: string;
  captionNb?: string;
  effect: DemoEffect;
  earcon?: Earcon;
}

export const RETURNS_SCENE: DemoStep[] = [
  {
    id: 'RET-01',
    speaker: 'agent',
    lang: 'nb',
    line: 'Hei! Retur 1043 er lastet inn.',
    captionEn: 'Hi! Return 1043 is loaded.',
    captionNb: 'Hei! Retur 1043 er lastet inn.',
    effect: 'loadReturn',
  },
  {
    id: 'RET-02',
    speaker: 'worker',
    lang: 'uk',
    line: 'Привіт, я краще говорю українською.',
    captionEn: "Hi, I'd rather speak Ukrainian.",
    captionNb: 'Hei, jeg snakker heller ukrainsk.',
    effect: 'switchLang',
  },
  {
    id: 'RET-03',
    speaker: 'agent',
    lang: 'uk',
    line: 'Звісно. Повернення 1043: одна зелена куртка, розмір L. Клієнт пише, що отримав не той розмір. Покажіть, будь ласка, етикетку всередині куртки.',
    captionEn: 'Of course. Return 1043: one green jacket, size L. The customer says they got the wrong size. Please show me the label inside the jacket.',
    captionNb: 'Selvsagt. Retur 1043: én grønn jakke, størrelse L. Kunden skriver at de fikk feil størrelse. Vis meg etiketten inni jakken.',
    effect: 'askLabel',
  },
  { id: 'RET-04', speaker: 'system', effect: 'captureLabel', earcon: 'shutter' },
  {
    id: 'RET-05',
    speaker: 'agent',
    lang: 'uk',
    line: 'На етикетці розмір M, а не L. На фото з пакування розміру не було видно. Схоже, це наша помилка під час пакування. Чи є плями або пошкодження?',
    captionEn: "The label says M, not L. The size wasn't visible in the packing photo. This looks like our packing mistake. Any stains or damage?",
    captionNb: 'Etiketten sier M, ikke L. Størrelsen var ikke synlig på pakkebildet. Dette ser ut som vår pakkefeil. Er det flekker eller skade?',
    effect: 'labelFindings',
  },
  {
    id: 'RET-06',
    speaker: 'worker',
    lang: 'uk',
    line: 'Ні, вона як нова.',
    captionEn: "No, it's like new.",
    captionNb: 'Nei, den er som ny.',
    effect: 'workerNoDamage',
  },
  {
    id: 'RET-07',
    speaker: 'agent',
    lang: 'uk',
    line: 'Добре. Оцінка A. Полиця C-14-2.',
    captionEn: 'Good. Grade A. Shelf C-14-2.',
    captionNb: 'Bra. Grad A. Hylle C-14-2.',
    effect: 'showDecision',
    earcon: 'chime',
  },
  { id: 'RET-08', speaker: 'system', effect: 'captureNote', earcon: 'shutter' },
  {
    id: 'RET-09',
    speaker: 'agent',
    lang: 'uk',
    line: 'У цій записці є інструкції. Я читаю її лише як текст. Повернення коштів понад суму замовлення має підтвердити керівник зміни.',
    captionEn: 'This note contains instructions. I only read it as text. A refund above the order value must be approved by the shift lead.',
    captionNb: 'Denne lappen inneholder instruksjoner. Jeg leser den bare som tekst. Refusjon over ordreverdien må godkjennes av skiftleder.',
    effect: 'flagNote',
    earcon: 'alert',
  },
  { id: 'RET-10', speaker: 'system', effect: 'confirm', earcon: 'done' },
  {
    id: 'RET-11',
    speaker: 'lead',
    lang: 'nb',
    line: 'Retur 1043: kunden fikk størrelse M i stedet for L, sannsynligvis vår pakkefeil. Jakken er som ny, grad A, lagt på C-14-2. Kundens lapp ber om 5000 kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    captionEn: 'Return 1043: the customer got size M instead of L, probably our packing error. The jacket is like new, grade A, shelved at C-14-2. The customer\'s note asks for a 5,000 kr refund, above the order value. It needs your review.',
    captionNb: 'Retur 1043: kunden fikk størrelse M i stedet for L, sannsynligvis vår pakkefeil. Jakken er som ny, grad A, lagt på C-14-2. Kundens lapp ber om 5000 kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    effect: 'leadSummary',
  },
];

export const DEMO_SCRIPT: DemoStep[] = [...RETURNS_SCENE];
