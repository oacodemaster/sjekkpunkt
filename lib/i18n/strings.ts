// UI strings. Appendix A of the demo brief plus app chrome.
// REVIEW: pl, uk, ro and lt need a native speaker check before the demo
// (ro and lt were not in the brief and are first drafts).

import type { Lang } from '@/lib/engine/types';

export const LANGS: Lang[] = ['nb', 'en', 'pl', 'uk', 'ro', 'lt'];

export const LANG_NAMES: Record<Lang, string> = {
  nb: 'Norsk',
  en: 'English',
  pl: 'Polski',
  uk: 'Українська',
  ro: 'Română',
  lt: 'Lietuvių',
};

type Row = Record<Lang, string>;

export const STRINGS = {
  // Appendix A
  check: { nb: 'Sjekk', en: 'Check', pl: 'Sprawdź', uk: 'Перевірити', ro: 'Verifică', lt: 'Tikrinti' },
  takePhoto: { nb: 'Ta bilde', en: 'Take photo', pl: 'Zrób zdjęcie', uk: 'Зробити фото', ro: 'Fă o poză', lt: 'Fotografuoti' },
  showLabel: { nb: 'Vis etiketten', en: 'Show the label', pl: 'Pokaż metkę', uk: 'Покажіть етикетку', ro: 'Arată eticheta', lt: 'Parodykite etiketę' },
  wrongItem: { nb: 'Feil vare', en: 'Wrong item', pl: 'Zły towar', uk: 'Не той товар', ro: 'Produs greșit', lt: 'Ne ta prekė' },
  missing: { nb: 'Mangler', en: 'Missing', pl: 'Brakuje', uk: 'Бракує', ro: 'Lipsește', lt: 'Trūksta' },
  correct: { nb: 'Riktig', en: 'Correct', pl: 'Zgadza się', uk: 'Правильно', ro: 'Corect', lt: 'Teisingai' },
  readyToSeal: { nb: 'Klar til forsegling', en: 'Ready to seal', pl: 'Gotowe do zaklejenia', uk: 'Готово до запечатування', ro: 'Gata de sigilat', lt: 'Galima užklijuoti' },
  confirmReturn: { nb: 'Bekreft retur', en: 'Confirm return', pl: 'Potwierdź zwrot', uk: 'Підтвердити повернення', ro: 'Confirmă returul', lt: 'Patvirtinti grąžinimą' },
  shelf: { nb: 'Hylle', en: 'Shelf', pl: 'Półka', uk: 'Полиця', ro: 'Raft', lt: 'Lentyna' },
  grade: { nb: 'Grad', en: 'Grade', pl: 'Ocena', uk: 'Оцінка', ro: 'Calificativ', lt: 'Įvertinimas' },
  pushToTalk: { nb: 'Trykk og snakk', en: 'Push to talk', pl: 'Naciśnij i mów', uk: 'Натисніть і говоріть', ro: 'Apasă și vorbește', lt: 'Spauskite ir kalbėkite' },
  sendToLead: { nb: 'Send til teamleder', en: 'Send to team lead', pl: 'Wyślij do kierownika zmiany', uk: 'Надіслати керівнику зміни', ro: 'Trimite la șeful de tură', lt: 'Siųsti pamainos vadovui' },
  scanReturn: { nb: 'Skann retur', en: 'Scan return', pl: 'Zeskanuj zwrot', uk: 'Скануйте повернення', ro: 'Scanează returul', lt: 'Nuskenuokite grąžinimą' },
  evidenceSaved: { nb: 'Bevisfoto lagret', en: 'Evidence photo saved', pl: 'Zdjęcie dowodowe zapisane', uk: 'Фото-доказ збережено', ro: 'Poza doveditoare salvată', lt: 'Įrodymo nuotrauka išsaugota' },

  // App chrome (M1)
  packStation: { nb: 'Pakking', en: 'Packing', pl: 'Pakowanie', uk: 'Пакування', ro: 'Ambalare', lt: 'Pakavimas' },
  returnStation: { nb: 'Retur', en: 'Returns', pl: 'Zwroty', uk: 'Повернення', ro: 'Retururi', lt: 'Grąžinimai' },
  ordersToPack: { nb: 'Ordrer til pakking', en: 'Orders to pack', pl: 'Zamówienia do spakowania', uk: 'Замовлення до пакування', ro: 'Comenzi de ambalat', lt: 'Užsakymai pakavimui' },
  returnsToInspect: { nb: 'Returer til kontroll', en: 'Returns to inspect', pl: 'Zwroty do sprawdzenia', uk: 'Повернення на перевірку', ro: 'Retururi de verificat', lt: 'Grąžinimai patikrinimui' },
  items: { nb: 'varer', en: 'items', pl: 'szt.', uk: 'шт.', ro: 'articole', lt: 'vnt.' },
  signOut: { nb: 'Logg ut', en: 'Sign out', pl: 'Wyloguj', uk: 'Вийти', ro: 'Deconectare', lt: 'Atsijungti' },
  device: { nb: 'Enhet', en: 'Device', pl: 'Urządzenie', uk: 'Пристрій', ro: 'Dispozitiv', lt: 'Įrenginys' },
  pickDevice: { nb: 'Velg enhet', en: 'Pick device', pl: 'Wybierz urządzenie', uk: 'Виберіть пристрій', ro: 'Alege dispozitivul', lt: 'Pasirinkite įrenginį' },
  pickDeviceHelp: {
    nb: 'Velg merkelappen på håndterminalen. Valget huskes på denne enheten.',
    en: 'Pick the label on this handheld. The choice is remembered on this device.',
    pl: 'Wybierz etykietę tego terminala. Wybór zostanie zapamiętany na tym urządzeniu.',
    uk: 'Виберіть мітку цього терміналу. Вибір буде збережено на цьому пристрої.',
    ro: 'Alege eticheta acestui terminal. Alegerea este reținută pe acest dispozitiv.',
    lt: 'Pasirinkite šio terminalo etiketę. Pasirinkimas bus įsimintas šiame įrenginyje.',
  },
  comingNext: { nb: 'Kommer i neste milepæl', en: 'Coming in the next milestone', pl: 'W następnym etapie', uk: 'У наступному етапі', ro: 'În următoarea etapă', lt: 'Kitame etape' },
  privacy: { nb: 'Personvern', en: 'Privacy', pl: 'Prywatność', uk: 'Конфіденційність', ro: 'Confidențialitate', lt: 'Privatumas' },
} satisfies Record<string, Row>;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang] ?? STRINGS[key].en;
}
