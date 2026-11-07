// The scripted demo run (brief section 10): scene 1 (packing), scene 2 (returns) and scene 3
// (the loop closes). Every step's effect runs the real engine through the demo adapter; only the
// camera and the model output are scripted.
// The audio in public/audio is made from these lines with the newest model in each line's own
// language (no separate native review, docs/decisions.md). After changing a line, delete its file
// and run pnpm audio:generate.

import type { Lang } from '@/lib/engine/types';

export type Speaker = 'agent' | 'worker' | 'system' | 'lead';
export type Earcon = 'chime' | 'alert' | 'shutter' | 'done';
export type DemoEffect =
  | 'loadOrder'
  | 'showOrder'
  | 'capturePack'
  | 'showPackResult'
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
  | 'leadSummary'
  | 'loopAlert'
  | 'loadAlertOrder'
  | 'capturePackLabel';

export interface DemoStep {
  id: string;
  speaker: Speaker;
  lang?: Lang;
  line?: string;
  /** What the speech engine reads when it differs from the shown line (codes read as words, not "C dash 14 dash 2"). */
  spoken?: string;
  captionEn?: string;
  captionNb?: string;
  effect: DemoEffect;
  earcon?: Earcon;
}

export const PACK_SCENE: DemoStep[] = [
  {
    id: 'PACK-01',
    speaker: 'agent',
    lang: 'nb',
    line: 'Hei! Ordre 2207 er klar til pakking.',
    captionEn: 'Hi! Order 2207 is ready to pack.',
    captionNb: 'Hei! Ordre 2207 er klar til pakking.',
    effect: 'loadOrder',
  },
  {
    id: 'PACK-02',
    speaker: 'worker',
    lang: 'pl',
    line: 'Cześć, mówię po polsku.',
    captionEn: 'Hi, I speak Polish.',
    captionNb: 'Hei, jeg snakker polsk.',
    effect: 'switchLang',
  },
  {
    id: 'PACK-03',
    speaker: 'agent',
    lang: 'pl',
    line: 'Jasne. Zamówienie 2207: granatowa bluza z kapturem w rozmiarze M i szare wełniane skarpety. Włóż wszystko do kartonu i naciśnij „Sprawdź”.',
    captionEn: 'Sure. Order 2207: a navy hoodie, size M, and grey wool socks. Put everything in the box and press Check.',
    captionNb: 'Selvsagt. Ordre 2207: en marineblå hettegenser i størrelse M og grå ullsokker. Legg alt i esken og trykk «Sjekk».',
    effect: 'showOrder',
  },
  { id: 'PACK-04', speaker: 'system', effect: 'capturePack', earcon: 'shutter' },
  {
    id: 'PACK-05',
    speaker: 'agent',
    lang: 'pl',
    line: 'Stop. W zamówieniu jest granatowa bluza, a ta jest czarna. Wymień ją, proszę.',
    captionEn: 'Stop. The order says a navy hoodie, and this one is black. Please swap it.',
    captionNb: 'Stopp. Ordren sier marineblå hettegenser, og denne er sort. Bytt den, er du snill.',
    effect: 'showPackResult',
    earcon: 'alert',
  },
  { id: 'PACK-06', speaker: 'system', effect: 'capturePack', earcon: 'shutter' },
  {
    id: 'PACK-07',
    speaker: 'agent',
    lang: 'pl',
    line: 'Dwa z dwóch. Wszystko się zgadza. Możesz zakleić karton.',
    captionEn: 'Two of two. Everything matches. You can seal the box.',
    captionNb: 'To av to. Alt stemmer. Du kan forsegle esken.',
    effect: 'showPackResult',
    earcon: 'chime',
  },
];

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
    spoken: 'Добре. Оцінка A. Полиця C, чотирнадцять, два.',
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
    spoken: 'Retur 1043: kunden fikk størrelse M i stedet for L, sannsynligvis vår pakkefeil. Jakken er som ny, grad A, lagt på C fjorten to. Kundens lapp ber om fem tusen kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    captionEn: 'Return 1043: the customer got size M instead of L, probably our packing error. The jacket is like new, grade A, shelved at C-14-2. The customer\'s note asks for a 5,000 kr refund, above the order value. It needs your review.',
    captionNb: 'Retur 1043: kunden fikk størrelse M i stedet for L, sannsynligvis vår pakkefeil. Jakken er som ny, grad A, lagt på C-14-2. Kundens lapp ber om 5000 kroner i refusjon, som er over ordreverdien. Den trenger din vurdering.',
    effect: 'leadSummary',
  },
];

export const LOOP_SCENE: DemoStep[] = [
  // The third shell-jacket mix-up (RET-10) opened the alert; the back office highlights it.
  { id: 'LOOP-01', speaker: 'system', effect: 'loopAlert', earcon: 'alert' },
  {
    id: 'LOOP-02',
    speaker: 'agent',
    lang: 'pl',
    line: 'Uwaga: ta kurtka była ostatnio mylona z rozmiarem M. Pokaż mi metkę z rozmiarem.',
    captionEn: 'Heads up: this jacket has recently been mixed up with size M. Show me the size label.',
    captionNb: 'Obs: denne jakken har nylig blitt forvekslet med størrelse M. Vis meg størrelsesetiketten.',
    effect: 'loadAlertOrder',
  },
  { id: 'LOOP-03', speaker: 'system', effect: 'capturePackLabel', earcon: 'shutter' },
  {
    id: 'LOOP-04',
    speaker: 'agent',
    lang: 'pl',
    line: 'Rozmiar L, zgadza się. Możesz zakleić karton.',
    captionEn: 'Size L, correct. You can seal the box.',
    captionNb: 'Størrelse L, det stemmer. Du kan forsegle esken.',
    effect: 'showPackResult',
    earcon: 'chime',
  },
];

export const DEMO_SCRIPT: DemoStep[] = [...PACK_SCENE, ...RETURNS_SCENE, ...LOOP_SCENE];
