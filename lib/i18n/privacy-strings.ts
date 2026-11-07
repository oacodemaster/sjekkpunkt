// Worker information screen (addendum section 10), shown on first launch and from the menu.
// REVIEW: pl, uk, ro and lt are drafts and need a native speaker check before real use.
// "{days}" is replaced with photo_retention_days from settings.

import type { Lang } from '@/lib/engine/types';

export interface PrivacyText {
  title: string;
  intro: string;
  capturedTitle: string;
  captured: string[];
  notTitle: string;
  not: string[];
  keptTitle: string;
  kept: string[];
  askTitle: string;
  ask: string[];
  tapsOnly: string;
  readButton: string;
  readOn: string; // "{date}"
  pickLanguage: string;
  pickLanguageHelp: string;
  back: string;
}

export const PRIVACY: Record<Lang, PrivacyText> = {
  nb: {
    title: 'Slik bruker Sjekkpunkt opplysninger om deg',
    intro: 'Sjekkpunkt kontrollerer varer, ikke folk. Her er det du bør vite før du begynner.',
    capturedTitle: 'Dette tar vi opp',
    captured: [
      'Bilder av varer, bare når du trykker på kameraknappen eller ber assistenten ta bildet.',
      'Tale bare mens du holder inne snakkeknappen, eller mens du selv har slått på håndfri modus.',
      'Hvilken håndterminal som ble brukt, og hva som ble bestemt, for eksempel at en retur fikk grad A.',
    ],
    notTitle: 'Dette gjør vi ikke',
    not: [
      'Ingen opptak i bakgrunnen.',
      'Ingen bilder av ansikter. Et bilde der et ansikt synes, slettes med en gang.',
      'Ingen måling eller rangering av ansatte, ingen statistikk per person og ingen tolking av følelser.',
      'Stemmen din brukes aldri til å logge inn eller kjenne deg igjen.',
    ],
    keptTitle: 'Så lenge lagrer vi det',
    kept: [
      'Bilder slettes automatisk etter {days} dager.',
      'Sjekkpunkt lagrer ikke lydopptak av deg. Talen gjøres om til tekst av stemmetjenesten ElevenLabs, og vi lagrer bare teksten du sa som merknad.',
      'Beslutninger om varer lagres i lagerets system så lenge lageret trenger dem.',
    ],
    askTitle: 'Hvem kan du spørre',
    ask: [
      'Lageret er ansvarlig for opplysningene. Sjekkpunkt og Holio behandler dem på vegne av lageret.',
      'Spør teamlederen din eller lagerets personvernkontakt hvis du lurer på noe.',
    ],
    tapsOnly: 'Du kan alltid gjøre alt med knapper, uten å snakke.',
    readButton: 'Jeg har lest dette',
    readOn: 'Lest {date}',
    pickLanguage: 'Velg språk',
    pickLanguageHelp: 'Skjermen og assistenten bruker dette språket. Du kan bytte senere.',
    back: 'Tilbake',
  },
  en: {
    title: 'How Sjekkpunkt uses information about you',
    intro: 'Sjekkpunkt checks items, not people. Here is what you should know before you start.',
    capturedTitle: 'What we capture',
    captured: [
      'Photos of items, only when you tap the camera button or ask the assistant to take the photo.',
      'Speech only while you hold the talk button, or while you have turned on hands-free mode yourself.',
      'Which handheld was used and what was decided, for example that a return got grade A.',
    ],
    notTitle: 'What we do not do',
    not: [
      'No background recording.',
      'No photos of faces. A photo that shows a face is deleted straight away.',
      'No measuring or ranking of staff, no statistics per person, and no reading of emotions.',
      'Your voice is never used to log in or to recognise you.',
    ],
    keptTitle: 'How long we keep it',
    kept: [
      'Photos are deleted automatically after {days} days.',
      'Sjekkpunkt does not store recordings of your voice. The voice service ElevenLabs turns speech into text, and we keep only the text you said as a note.',
      "Decisions about items are kept in the warehouse's system for as long as the warehouse needs them.",
    ],
    askTitle: 'Who to ask',
    ask: [
      'The warehouse is responsible for this information. Sjekkpunkt and Holio process it on behalf of the warehouse.',
      "Ask your team lead or the warehouse's privacy contact if you have questions.",
    ],
    tapsOnly: 'You can always do everything with buttons, without speaking.',
    readButton: 'I have read this',
    readOn: 'Read {date}',
    pickLanguage: 'Choose language',
    pickLanguageHelp: 'The screen and the assistant use this language. You can change it later.',
    back: 'Back',
  },
  pl: {
    title: 'Jak Sjekkpunkt korzysta z informacji o Tobie',
    intro: 'Sjekkpunkt sprawdza towary, nie ludzi. Oto, co warto wiedzieć przed rozpoczęciem pracy.',
    capturedTitle: 'Co rejestrujemy',
    captured: [
      'Zdjęcia towarów, tylko gdy naciśniesz przycisk aparatu albo poprosisz asystenta o zrobienie zdjęcia.',
      'Mowę tylko wtedy, gdy trzymasz wciśnięty przycisk mówienia albo gdy sam włączysz tryb głośnomówiący.',
      'Którego terminala użyto i co zdecydowano, na przykład że zwrot otrzymał ocenę A.',
    ],
    notTitle: 'Czego nie robimy',
    not: [
      'Żadnego nagrywania w tle.',
      'Żadnych zdjęć twarzy. Zdjęcie, na którym widać twarz, jest od razu usuwane.',
      'Żadnego mierzenia ani oceniania pracowników, żadnych statystyk na osobę i żadnego odczytywania emocji.',
      'Twój głos nigdy nie służy do logowania ani do rozpoznawania Cię.',
    ],
    keptTitle: 'Jak długo to przechowujemy',
    kept: [
      'Zdjęcia są automatycznie usuwane po {days} dniach.',
      'Sjekkpunkt nie przechowuje nagrań Twojego głosu. Usługa głosowa ElevenLabs zamienia mowę na tekst, a my zapisujemy tylko tekst, który powiedziałeś, jako notatkę.',
      'Decyzje dotyczące towarów są przechowywane w systemie magazynu tak długo, jak magazyn ich potrzebuje.',
    ],
    askTitle: 'Kogo zapytać',
    ask: [
      'Za te informacje odpowiada magazyn. Sjekkpunkt i Holio przetwarzają je w imieniu magazynu.',
      'Jeśli masz pytania, zapytaj kierownika zmiany lub osobę odpowiedzialną za ochronę danych w magazynie.',
    ],
    tapsOnly: 'Zawsze możesz zrobić wszystko przyciskami, bez mówienia.',
    readButton: 'Przeczytałem/am',
    readOn: 'Przeczytano {date}',
    pickLanguage: 'Wybierz język',
    pickLanguageHelp: 'Ekran i asystent używają tego języka. Możesz go później zmienić.',
    back: 'Wstecz',
  },
  uk: {
    title: 'Як Sjekkpunkt використовує інформацію про вас',
    intro: 'Sjekkpunkt перевіряє товари, а не людей. Ось що варто знати перед початком роботи.',
    capturedTitle: 'Що ми записуємо',
    captured: [
      'Фото товарів, лише коли ви натискаєте кнопку камери або просите асистента зробити фото.',
      'Мовлення лише тоді, коли ви тримаєте кнопку розмови, або коли ви самі ввімкнули режим без рук.',
      'Який термінал використовувався і що було вирішено, наприклад, що повернення отримало оцінку A.',
    ],
    notTitle: 'Чого ми не робимо',
    not: [
      'Жодного запису у фоновому режимі.',
      'Жодних фото облич. Фото, на якому видно обличчя, одразу видаляється.',
      'Жодного вимірювання чи рейтингу працівників, жодної статистики на особу і жодного розпізнавання емоцій.',
      'Ваш голос ніколи не використовується для входу чи для того, щоб вас розпізнати.',
    ],
    keptTitle: 'Як довго ми це зберігаємо',
    kept: [
      'Фото автоматично видаляються через {days} днів.',
      'Sjekkpunkt не зберігає записів вашого голосу. Голосовий сервіс ElevenLabs перетворює мовлення на текст, а ми зберігаємо лише сказаний вами текст як примітку.',
      'Рішення щодо товарів зберігаються в системі складу стільки, скільки вони потрібні складу.',
    ],
    askTitle: 'Кого запитати',
    ask: [
      'За цю інформацію відповідає склад. Sjekkpunkt і Holio обробляють її від імені складу.',
      'Якщо маєте запитання, зверніться до керівника зміни або до відповідальної особи складу з питань захисту даних.',
    ],
    tapsOnly: 'Ви завжди можете зробити все кнопками, не говорячи.',
    readButton: 'Я прочитав(ла) це',
    readOn: 'Прочитано {date}',
    pickLanguage: 'Виберіть мову',
    pickLanguageHelp: 'Екран і асистент використовують цю мову. Ви можете змінити її пізніше.',
    back: 'Назад',
  },
  ro: {
    title: 'Cum folosește Sjekkpunkt informațiile despre tine',
    intro: 'Sjekkpunkt verifică produse, nu oameni. Iată ce trebuie să știi înainte să începi.',
    capturedTitle: 'Ce înregistrăm',
    captured: [
      'Poze cu produse, doar când apeși butonul camerei sau îi ceri asistentului să facă poza.',
      'Vorbirea doar cât timp ții apăsat butonul de vorbit sau cât timp ai pornit tu modul mâini libere.',
      'Ce terminal a fost folosit și ce s-a decis, de exemplu că un retur a primit calificativul A.',
    ],
    notTitle: 'Ce nu facem',
    not: [
      'Nicio înregistrare în fundal.',
      'Nicio poză cu fețe. O poză în care se vede o față este ștearsă imediat.',
      'Nicio măsurare sau clasificare a angajaților, nicio statistică pe persoană și nicio interpretare a emoțiilor.',
      'Vocea ta nu este folosită niciodată pentru autentificare sau pentru a te recunoaște.',
    ],
    keptTitle: 'Cât timp le păstrăm',
    kept: [
      'Pozele sunt șterse automat după {days} zile.',
      'Sjekkpunkt nu păstrează înregistrări ale vocii tale. Serviciul de voce ElevenLabs transformă vorbirea în text, iar noi păstrăm doar textul spus de tine, ca notă.',
      'Deciziile despre produse sunt păstrate în sistemul depozitului cât timp depozitul are nevoie de ele.',
    ],
    askTitle: 'Pe cine poți întreba',
    ask: [
      'Depozitul este responsabil pentru aceste informații. Sjekkpunkt și Holio le prelucrează în numele depozitului.',
      'Dacă ai întrebări, întreabă-l pe șeful de tură sau persoana de contact pentru protecția datelor din depozit.',
    ],
    tapsOnly: 'Poți face oricând totul cu butoane, fără să vorbești.',
    readButton: 'Am citit',
    readOn: 'Citit {date}',
    pickLanguage: 'Alege limba',
    pickLanguageHelp: 'Ecranul și asistentul folosesc această limbă. O poți schimba mai târziu.',
    back: 'Înapoi',
  },
  lt: {
    title: 'Kaip Sjekkpunkt naudoja informaciją apie jus',
    intro: 'Sjekkpunkt tikrina prekes, ne žmones. Štai ką verta žinoti prieš pradedant.',
    capturedTitle: 'Ką mes įrašome',
    captured: [
      'Prekių nuotraukas, tik kai paspaudžiate kameros mygtuką arba paprašote asistento nufotografuoti.',
      'Kalbą tik tada, kai laikote nuspaudę kalbėjimo mygtuką arba kai patys įjungėte laisvų rankų režimą.',
      'Kuris terminalas buvo naudotas ir kas nuspręsta, pavyzdžiui, kad grąžinimas gavo įvertinimą A.',
    ],
    notTitle: 'Ko mes nedarome',
    not: [
      'Jokio įrašymo fone.',
      'Jokių veidų nuotraukų. Nuotrauka, kurioje matyti veidas, iš karto ištrinama.',
      'Jokio darbuotojų matavimo ar reitingavimo, jokios statistikos apie asmenį ir jokio emocijų atpažinimo.',
      'Jūsų balsas niekada nenaudojamas prisijungti ar jus atpažinti.',
    ],
    keptTitle: 'Kiek laiko tai saugome',
    kept: [
      'Nuotraukos automatiškai ištrinamos po {days} d.',
      'Sjekkpunkt nesaugo jūsų balso įrašų. Balso paslauga ElevenLabs paverčia kalbą tekstu, o mes saugome tik jūsų pasakytą tekstą kaip pastabą.',
      'Sprendimai dėl prekių saugomi sandėlio sistemoje tol, kol jų reikia sandėliui.',
    ],
    askTitle: 'Ko paklausti',
    ask: [
      'Už šią informaciją atsako sandėlis. Sjekkpunkt ir Holio ją tvarko sandėlio vardu.',
      'Jei turite klausimų, kreipkitės į pamainos vadovą arba sandėlio asmens duomenų apsaugos kontaktinį asmenį.',
    ],
    tapsOnly: 'Visada galite viską atlikti mygtukais, nekalbėdami.',
    readButton: 'Perskaičiau',
    readOn: 'Perskaityta {date}',
    pickLanguage: 'Pasirinkite kalbą',
    pickLanguageHelp: 'Ekranas ir asistentas naudoja šią kalbą. Vėliau galite ją pakeisti.',
    back: 'Atgal',
  },
};
