// Rate limit and spend cap messages (M8). REVIEW: pl, uk, ro and lt are drafts for a native check,
// like the other station strings.

export const LIMIT_STRINGS = {
  rateLimited: {
    nb: 'For mange forsøk på kort tid. Vent litt og prøv igjen.',
    en: 'Too many tries in a short time. Wait a moment and try again.',
    pl: 'Zbyt wiele prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.',
    uk: 'Забагато спроб за короткий час. Зачекайте трохи й спробуйте ще раз.',
    ro: 'Prea multe încercări într-un timp scurt. Așteaptă puțin și încearcă din nou.',
    lt: 'Per daug bandymų per trumpą laiką. Palaukite ir bandykite dar kartą.',
  },
  visionCappedReturn: {
    nb: 'Bildeanalysen er satt på pause til midnatt (dagens kostnadsgrense er nådd). Send varen til teamleder.',
    en: 'Photo checks are paused until midnight (today’s spend limit is reached). Send the item to the team lead.',
    pl: 'Analiza zdjęć jest wstrzymana do północy (osiągnięto dzienny limit kosztów). Przekaż produkt kierownikowi zmiany.',
    uk: 'Аналіз фото призупинено до півночі (денний ліміт витрат вичерпано). Передайте товар керівнику зміни.',
    ro: 'Analiza pozelor este oprită până la miezul nopții (limita zilnică de cost a fost atinsă). Trimite produsul la șeful de tură.',
    lt: 'Nuotraukų tikrinimas sustabdytas iki vidurnakčio (pasiekta dienos išlaidų riba). Perduokite prekę pamainos vadovui.',
  },
  visionCappedPack: {
    nb: 'Bildeanalysen er satt på pause til midnatt (dagens kostnadsgrense er nådd). Skann strekkoden på hver vare.',
    en: 'Photo checks are paused until midnight (today’s spend limit is reached). Scan the barcode on each item.',
    pl: 'Analiza zdjęć jest wstrzymana do północy (osiągnięto dzienny limit kosztów). Zeskanuj kod kreskowy każdego produktu.',
    uk: 'Аналіз фото призупинено до півночі (денний ліміт витрат вичерпано). Скануйте штрихкод кожного товару.',
    ro: 'Analiza pozelor este oprită până la miezul nopții (limita zilnică de cost a fost atinsă). Scanează codul de bare al fiecărui produs.',
    lt: 'Nuotraukų tikrinimas sustabdytas iki vidurnakčio (pasiekta dienos išlaidų riba). Nuskenuokite kiekvienos prekės brūkšninį kodą.',
  },
  voiceCapped: {
    nb: 'Stemme er satt på pause til midnatt (dagens kostnadsgrense er nådd). Bruk knappene.',
    en: 'Voice is paused until midnight (today’s spend limit is reached). Use the buttons.',
    pl: 'Głos jest wstrzymany do północy (osiągnięto dzienny limit kosztów). Używaj przycisków.',
    uk: 'Голос призупинено до півночі (денний ліміт витрат вичерпано). Користуйтеся кнопками.',
    ro: 'Vocea este oprită până la miezul nopții (limita zilnică de cost a fost atinsă). Folosește butoanele.',
    lt: 'Balsas sustabdytas iki vidurnakčio (pasiekta dienos išlaidų riba). Naudokite mygtukus.',
  },
} as const;
