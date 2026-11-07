// Voice strings (M3). REVIEW: pl and uk need a native speaker check before the demo;
// ro and lt are first drafts.

export const VOICE_STRINGS = {
  voiceStart: { nb: 'Start stemme', en: 'Start voice', pl: 'Włącz głos', uk: 'Увімкнути голос', ro: 'Pornește vocea', lt: 'Įjungti balsą' },
  voiceStop: { nb: 'Slå av stemme', en: 'Turn off voice', pl: 'Wyłącz głos', uk: 'Вимкнути голос', ro: 'Oprește vocea', lt: 'Išjungti balsą' },
  voiceConnecting: { nb: 'Kobler til …', en: 'Connecting …', pl: 'Łączenie …', uk: 'Підключення …', ro: 'Se conectează …', lt: 'Jungiamasi …' },
  voiceListening: { nb: 'Lytter', en: 'Listening', pl: 'Słucham', uk: 'Слухаю', ro: 'Ascult', lt: 'Klausausi' },
  voiceSpeaking: { nb: 'Snakker', en: 'Speaking', pl: 'Mówię', uk: 'Говорю', ro: 'Vorbesc', lt: 'Kalbu' },
  voiceReady: { nb: 'Hold inne for å snakke', en: 'Hold to talk', pl: 'Przytrzymaj, aby mówić', uk: 'Утримуйте, щоб говорити', ro: 'Ține apăsat ca să vorbești', lt: 'Laikykite, kad kalbėtumėte' },
  handsFree: { nb: 'Håndfri', en: 'Hands-free', pl: 'Bez użycia rąk', uk: 'Без рук', ro: 'Mâini libere', lt: 'Laisvos rankos' },
  captions: { nb: 'Teksting', en: 'Captions', pl: 'Napisy', uk: 'Субтитри', ro: 'Subtitrări', lt: 'Subtitrai' },
  language: { nb: 'Språk', en: 'Language', pl: 'Język', uk: 'Мова', ro: 'Limbă', lt: 'Kalba' },
  tapOnlyHint: {
    nb: 'Stemme er valgfritt. Alt kan gjøres med knappene.',
    en: 'Voice is optional. Everything works with the buttons.',
    pl: 'Głos jest opcjonalny. Wszystko działa przyciskami.',
    uk: 'Голос необов’язковий. Усе працює кнопками.',
    ro: 'Vocea este opțională. Totul merge și cu butoanele.',
    lt: 'Balsas neprivalomas. Viskas veikia ir mygtukais.',
  },
  micDenied: {
    nb: 'Mikrofonen er blokkert, så stemme er av. Bruk knappene, eller tillat mikrofon i nettleserens innstillinger for nettstedet.',
    en: 'The microphone is blocked, so voice is off. Use the buttons, or allow the microphone in the browser’s site settings.',
    pl: 'Mikrofon jest zablokowany, więc głos jest wyłączony. Używaj przycisków albo zezwól na mikrofon w ustawieniach strony w przeglądarce.',
    uk: 'Мікрофон заблоковано, тому голос вимкнено. Користуйтеся кнопками або дозвольте мікрофон у налаштуваннях сайту в браузері.',
    ro: 'Microfonul este blocat, deci vocea este oprită. Folosește butoanele sau permite microfonul în setările site-ului din browser.',
    lt: 'Mikrofonas užblokuotas, todėl balsas išjungtas. Naudokite mygtukus arba leiskite mikrofoną naršyklės svetainės nustatymuose.',
  },
  voiceUnavailable: {
    nb: 'Stemme er ikke tilgjengelig nå. Bruk knappene.',
    en: 'Voice is not available right now. Use the buttons.',
    pl: 'Głos jest teraz niedostępny. Używaj przycisków.',
    uk: 'Голос зараз недоступний. Користуйтеся кнопками.',
    ro: 'Vocea nu este disponibilă acum. Folosește butoanele.',
    lt: 'Balsas dabar nepasiekiamas. Naudokite mygtukus.',
  },
  voiceFirstMessage: {
    nb: 'Hei! Retur {n} er lastet inn.',
    en: 'Hi! Return {n} is loaded.',
    pl: 'Cześć! Zwrot {n} jest wczytany.',
    uk: 'Привіт! Повернення {n} завантажено.',
    ro: 'Bună! Returul {n} este încărcat.',
    lt: 'Labas! Grąžinimas {n} įkeltas.',
  },
  translating: { nb: 'oversetter …', en: 'translating …', pl: 'tłumaczenie …', uk: 'переклад …', ro: 'se traduce …', lt: 'verčiama …' },
} as const;
