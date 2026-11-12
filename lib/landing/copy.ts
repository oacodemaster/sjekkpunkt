// The landing page's words, from docs/landing-copy.md (approved by the owner on 2026-11-12).
// Norwegian at /, English at /en. Change the doc and this file together; a claim here must stay
// true of the product (docs/landing-copy.md, section 4). lib/landing/copy.test.ts checks the
// banned words, the two languages' shape and the anchors.

import type { LeadField } from '@/lib/leads/schema';
import { LEAD_INTERESTS, LEAD_ROLES, LEAD_VOLUMES } from '@/lib/leads/schema';

export type LandingLang = 'nb' | 'en';
export const LANDING_LANGS: LandingLang[] = ['nb', 'en'];
export const landingPath = (lang: LandingLang) => (lang === 'nb' ? '/' : '/en');

const NBSP = ' ';

export interface Shot {
  /** file under public/landing/<lang>/ (webp) */
  src: string;
  alt: string;
}

export interface LandingCopy {
  meta: { title: string; description: string; ogAlt: string };
  anchors: { problem: string; how: string; try: string; watch: string; floor: string; pilot: string; faq: string; form: string };
  nav: { how: string; try: string; faq: string; signIn: string; cta: string; langLabel: string; skip: string; menu: string };
  hero: { eyebrow: string; h1: string; lead: string; cta: string; secondary: string; facts: string[]; imageAlt: string };
  problem: { kicker: string; h2: string; scene: string; cards: { title: string; text: string }[]; exampleTitle: string; exampleText: string };
  how: {
    kicker: string;
    h2: string;
    lead: string;
    packing: { title: string; steps: { title: string; text: string; shot: Shot }[] };
    returns: { title: string; steps: { title: string; text: string; shot: Shot }[] };
    loop: { title: string; text: string; shot: Shot };
    teamLead: { title: string; text: string; shot: Shot };
  };
  try: {
    kicker: string;
    h2: string;
    lead: string;
    next: string;
    back: string;
    soundOn: string;
    soundOff: string;
    restart: string;
    end: string;
    fullDemo: string;
    progress: string;
    loading: string;
    stationLabel: string;
    coach: string;
    packer: string;
    stepTitles: string[];
  };
  watch: { kicker: string; h2: string; lead: string; videoLabel: string };
  floor: { kicker: string; h2: string; points: { title: string; text: string }[] };
  pilot: { kicker: string; h2: string; lead: string; items: { title: string; text: string }[]; cta: string };
  faq: { kicker: string; h2: string; items: { q: string; a: string }[] };
  form: {
    kicker: string;
    h2: string;
    lead: string;
    labels: Record<LeadField, string>;
    optional: string;
    choose: string;
    roles: Record<(typeof LEAD_ROLES)[number], string>;
    volumes: Record<(typeof LEAD_VOLUMES)[number], string>;
    interests: Record<(typeof LEAD_INTERESTS)[number], string>;
    messageHint: string;
    consentBefore: string;
    consentLink: string;
    consentAfter: string;
    submit: string;
    sending: string;
    errors: Record<'name' | 'email' | 'company' | 'role' | 'volume' | 'interest' | 'message' | 'tooFast' | 'rateLimited' | 'failed', string>;
    errorSummary: string;
    sentTitle: string;
    sentBefore: string;
    sentTry: string;
    sentOr: string;
    sentDemo: string;
    sentAfter: string;
  };
  footer: { builtBy: string; privacy: string; signIn: string; motto: string };
}

const shot = (lang: LandingLang, src: string, alt: string): Shot => ({ src: `/landing/${lang}/${src}.webp`, alt });

export const CONTACT_EMAIL = 'hei@forsterk.no';

const nb: LandingCopy = {
  meta: {
    title: 'Sjekkpunkt: stopp feil vare før esken tapes igjen',
    description:
      'Kamerasjekk på håndterminalen for lagre som pakker netthandel. Feil vare og feil størrelse stoppes ved pakkebordet, og hver retur får grad og hylle med bilder. Klar for pilot.',
    ogAlt: 'Sjekkpunkt på en håndterminal: «Feil vare» og en rød ramme rundt en svart hettegenser som ikke hører til ordren.',
  },
  anchors: { problem: 'problemet', how: 'slik-virker-det', try: 'prov', watch: 'se-det', floor: 'lagergulvet', pilot: 'pilot', faq: 'sporsmal', form: 'skjema' },
  nav: { how: 'Slik virker det', try: 'Prøv', faq: 'Spørsmål', signIn: 'Logg inn', cta: 'Be om en pilot', langLabel: 'Språk', skip: 'Hopp til innholdet', menu: 'Sider' },
  hero: {
    eyebrow: 'For lagre som pakker netthandel',
    h1: 'Feil vare stoppes før esken tapes igjen.',
    lead: 'Sjekkpunkt er en kamerasjekk på håndterminalen. Den sammenligner esken med ordren før den forsegles, og gir hver retur grad og hylle etter faste regler, med bilder.',
    cta: 'Be om en pilot',
    secondary: 'Se hvordan det virker',
    facts: ['Kjører i nettleseren på Android', 'Seks språk', 'Stemme eller knapper'],
    imageAlt: 'Håndterminal ved pakkebordet. Skjermen viser «Feil vare» og en rød ramme rundt en svart hettegenser som ikke hører til ordren.',
  },
  problem: {
    kicker: 'Problemet',
    h2: 'En feil eske blir fem nye oppgaver.',
    scene:
      'Kunden bestilte hettegenseren i L. I esken lå en M. Nå venter en retur, en ny pakke, en sak hos kundeservice og kanskje en anmeldelse med én stjerne. Og ingen på lageret vet hvorfor det skjedde.',
    cards: [
      {
        title: 'Dag to for ekstrahjelpen.',
        text: 'Det er november og køen er lang. Marineblått og svart ser likt ut under lysrørene, og M og L ligger i samme hylle. Ingen har tid til å sjekke etter.',
      },
      {
        title: 'Returbenken gjetter.',
        text: 'Skal genseren tilbake på hylla, til outlet eller kasseres? Hver medarbeider vurderer litt ulikt. Og når kunden sier at det var feil vare fra start, finnes det ikke noe bilde av det som ble sendt.',
      },
      {
        title: 'Dere hører det fra kundene.',
        text: 'Forvekslingene dukker opp som klager og returer, uker senere. Da er det vanskelig å se hvilke varer som blandes, og hvor.',
      },
    ],
    exampleTitle: 'Eksempel, ikke en måling.',
    exampleText:
      '300 ordrer om dagen og én feil per 200 pakker blir 1,5 feil pakker hver dag, rundt 30 i måneden. Hva koster én hos dere, med frakt begge veier, ny pakke og tid i kundeservice?',
  },
  how: {
    kicker: 'Slik virker det',
    h2: 'Én sjekk ved pakkebordet. Én ved returbenken.',
    lead: 'Pakkeren og returmedarbeideren bruker den håndterminalen de har. Teamlederen ser sammenhengen.',
    packing: {
      title: 'Pakking',
      steps: [
        { title: 'Skann ordren.', text: 'Pakkeren ser varene, antall og hylleplass.', shot: shot('nb', 'pack-order', 'Ordre 2207 på håndterminalen: en marineblå hettegenser i M og grå ullsokker, med hylleplass.') },
        {
          title: 'Vis esken.',
          text: 'Ett bilde ovenfra. Sjekkpunkt sammenligner det med ordren og merker hver vare.',
          shot: shot('nb', 'pack-box', 'Bildet av esken ovenfra mens Sjekkpunkt sjekker det mot ordren.'),
        },
        {
          title: 'Rett feilen, eller forsegl.',
          text: 'Feil vare får rød ramme og beskjed om hva som skal byttes. Finnes plagget i flere størrelser, ber appen om et bilde av etiketten, eller pakkeren skanner strekkoden. Grønt betyr forsegl, og bildet lagres som pakkebevis.',
          shot: shot('nb', 'pack-ok', 'Esken er riktig: grønne rammer rundt begge varene, «Klar til forsegling».'),
        },
      ],
    },
    returns: {
      title: 'Retur',
      steps: [
        {
          title: 'Skann returen.',
          text: 'Ordren, kundens grunn og pakkebeviset fra utsendingen kommer opp.',
          shot: shot('nb', 'ret-load', 'Retur 1043 på håndterminalen med kundens grunn og pakkebeviset fra utsendingen.'),
        },
        {
          title: 'Ta bildene appen ber om.',
          text: 'Forside, etikett, eventuelle skader og kundens lapp.',
          shot: shot('nb', 'ret-photos', 'Bildet av etiketten i jakken, der størrelsen leses: M, ikke L.'),
        },
        {
          title: 'Bekreft grad og hylle.',
          text: 'Appen foreslår grad A til D og hylle etter graderingsguiden deres. Medarbeideren sjekker og bekrefter. Refusjonen blir aldri høyere enn det varen kostet. Usikre saker går til teamlederen.',
          shot: shot('nb', 'ret-decision', 'Forslaget for returen: grad A og hylle C-14-2, klart til å bekreftes.'),
        },
      ],
    },
    loop: {
      title: 'Retur gjør pakkingen bedre',
      text: 'Når returbenken finner at kunden fikk feil størrelse, telles det som en forveksling mellom to varer. Skjer den samme forvekslingen tre ganger på sju dager, må pakkeren vise etiketten hver gang de to varene pakkes, til teamlederen fjerner varselet.',
      shot: shot('nb', 'loop-alert', 'Pakkevarsel på håndterminalen: jakken har blitt forvekslet med størrelse M, vis etiketten.'),
    },
    teamLead: {
      title: 'For teamlederen',
      text: 'Usikre returer kommer som korte saker med bilder, et forslag og en oppsummering på norsk. Godkjenn, endre med en begrunnelse, eller avvis. Oversikten viser hvilke varer som forveksles og hvor mange pakker som ble stoppet. Aldri tall per ansatt.',
      shot: shot('nb', 'lead-insights', 'Teamlederens oversikt: hvilke varer som forveksles, og hvor mange pakker som ble stoppet.'),
    },
  },
  try: {
    kicker: 'Prøv selv',
    h2: 'Prøv en pakkesjekk.',
    lead: 'Ordre 2207 er en marineblå hettegenser i M og et par ullsokker. Noen har lagt i en svart genser. Trykk deg gjennom og se det pakkeren ser. Pakkeren her snakker polsk; teksten under viser hva coachen sier.',
    next: 'Neste',
    back: 'Tilbake',
    soundOn: 'Slå på lyd',
    soundOff: 'Slå av lyd',
    restart: 'Begynn på nytt',
    end: 'Pakken er riktig og forseglet. Bildet er lagret som pakkebevis.',
    fullDemo: 'Se hele demoen, med retur og teamleder',
    progress: 'Steg {n} av {total}',
    loading: 'Laster pakkesjekken …',
    stationLabel: 'Pakkestasjonen i demoen',
    coach: 'Coach',
    packer: 'Pakker',
    stepTitles: ['Ordren er klar', 'Pakkeren snakker polsk', 'Coachen leser ordren', 'Sjekk esken', 'Bytt og sjekk igjen', 'Forsegl'],
  },
  watch: {
    kicker: 'Se det',
    h2: 'Se Sjekkpunkt i bruk, 25 sekunder.',
    lead: 'Fra en feil genser ved pakkebordet til returbenken og teamlederen.',
    videoLabel: 'Sjekkpunkt i bruk, 25 sekunder',
  },
  floor: {
    kicker: 'Hverdagen',
    h2: 'Bygget for lagergulvet.',
    points: [
      { title: 'Pakkerens eget språk.', text: 'Skjerm og stemme på norsk, engelsk, polsk, ukrainsk, rumensk og litauisk. Teamlederen leser alt på norsk.' },
      { title: 'Stemme når hendene er fulle.', text: 'Hold inne snakkeknappen, eller slå på håndfri. Hvert steg har også en knapp, så ingen må snakke.' },
      { title: 'Utstyret dere har.', text: 'Kjører i Chrome på Android-håndterminaler og -telefoner med kamera bak. Ingen app å installere. Teamlederen bruker PC eller nettbrett.' },
      { title: 'Noen sekunder per eske.', text: 'Ett bilde ovenfra. I testene våre kom svaret på 1 til 5 sekunder. Et svar som tar for lang tid, blir aldri grønt.' },
      { title: 'Varer, ikke folk.', text: 'Kameraet tar bilde bare når noen trykker eller ber om det. Bilder der et ansikt synes, slettes med en gang. Ingen statistikk per ansatt, og stemmen tas ikke opp.' },
      { title: 'Trygt å slippe inn.', text: 'Data lagres i EU. Hver beslutning skrives i en logg som ikke kan endres. Et daglig tak på AI-kostnader, og når taket er nådd, går appen over til knapper og strekkode.' },
    ],
  },
  pilot: {
    kicker: 'Pilot',
    h2: 'Klar for en pilot. Ikke prøvd i drift ennå.',
    lead: 'Sjekkpunkt er ferdig bygget, men har ikke vært i bruk på et ekte lager. Derfor finner du ingen kundelogoer eller resultattall her. Vi vil heller vise det på deres gulv.',
    items: [
      { title: 'Fire uker.', text: 'Én pakkestasjon og én returbenk, eller bare én av dem.' },
      { title: 'Dere stiller med:', text: 'én eller to Android-håndterminaler eller telefoner med kamera, en eksport av varer og ordrer, en kontaktperson på gulvet og reglene dere bruker for returer i dag.' },
      {
        title: 'Vi gjør:',
        text: 'setter opp Sjekkpunkt med varene og returreglene deres, lærer opp de første på gulvet (rundt en halvtime), følger opp hver dag den første uka, og legger fram det vi har sett etter fire uker: pakker som ble stoppet, forvekslinger, returgrader og hva medarbeiderne syntes.',
      },
      { title: 'Før start:', text: 'databehandleravtale, og underlag dere kan bruke når dere drøfter verktøyet med de tillitsvalgte.' },
      { title: 'Pris:', text: 'Piloten koster ingenting.' },
      { title: 'Etterpå:', text: 'Dere bestemmer om dere vil fortsette. Ingen binding.' },
    ],
    cta: 'Be om en pilot',
  },
  faq: {
    kicker: 'Spørsmål',
    h2: 'Det dere lurer på.',
    items: [
      {
        q: 'Trenger vi ny maskinvare?',
        a: 'Som regel ikke. Sjekkpunkt kjører i Chrome på Android, på håndterminaler og telefoner med kamera bak. Strekkoder leses med kameraet eller skrives inn. Før piloten tester vi på enhetene dere har.',
      },
      {
        q: 'Blir pakkingen tregere?',
        a: 'Hver eske får ett bilde ovenfra. I testene våre kom svaret på 1 til 5 sekunder. Plagg som finnes i flere størrelser trenger i tillegg et bilde av etiketten eller en strekkode, fordi størrelsen ikke synes ovenfra. Hva det betyr for tempoet hos dere, måler vi i piloten.',
      },
      {
        q: 'Folkene våre snakker mange språk.',
        a: 'Derfor finnes skjerm og stemme på seks språk, og coachen bytter språk når noen snakker et annet av dem. Det medarbeideren skriver eller sier som merknad, oversettes til norsk for teamlederen. Mangler dere et språk, si fra.',
      },
      {
        q: 'Hva med personvern og kontroll av ansatte?',
        a: 'Sjekkpunkt kontrollerer varer, ikke folk. Det finnes ingen statistikk eller rangering per ansatt, ingen opptak i bakgrunnen og ingen tolking av følelser. Bilder slettes automatisk etter en periode dere bestemmer (30 dager som standard), og bilder med ansikt slettes med en gang. Lageret er behandlingsansvarlig. Før piloten får dere en databehandleravtale og underlaget dere trenger for å drøfte verktøyet med de tillitsvalgte.',
      },
      {
        q: 'Virker det med ordresystemet vårt?',
        a: 'I dag leses varer, ordrer og returer inn som CSV-filer, og hver hendelse (pakke sjekket, retur avgjort, lagerendring) lagres i et fast format som et lagersystem kan ta imot. Hvordan vi kobler Sjekkpunkt til deres lagersystem eller nettbutikk, avtaler vi i piloten.',
      },
      {
        q: 'Hva skjer hvis kameraet tar feil?',
        a: 'Er Sjekkpunkt usikker, sier den fra og ber om et nytt bilde, etiketten eller strekkoden. Den godkjenner aldri på gjetning. En vare som tydelig er feil, kan ikke pakkeren overstyre. Ser kameraet ikke etiketten etter to nye forsøk, for eksempel på grunn av plastpose eller gjenskinn, kan pakkeren bekrefte selv og velge en grunn. Ved retur foreslår appen, og medarbeideren bekrefter. Hvor ofte den tar feil hos dere, måler vi i piloten.',
      },
      {
        q: 'Hva om nettet eller AI-tjenesten er nede?',
        a: 'Strekkode og manuell bekreftelse virker uten bildeanalyse. Usikre returer går til teamlederen. Når dagens budsjett for AI er brukt opp, går appen over til bare knapper og sier det på skjermen.',
      },
      {
        q: 'Hvor lagres dataene?',
        a: 'Database og bilder ligger i EU (Stockholm). Bildeanalysen og stemmen går gjennom Google og ElevenLabs. Før en pilot med ekte data setter vi dem opp med lagring i EU og uten at dataene brukes til trening.',
      },
      {
        q: 'Hva koster det?',
        a: 'Piloten er gratis. Etter piloten avtaler vi en fast pris per stasjon og måned ut fra volumet deres, og dere får prisen før dere bestemmer dere.',
      },
      { q: 'Hvem står bak?', a: 'Sjekkpunkt er laget av Forsterk, et norsk byrå som lager nettsider og digitale verktøy.' },
    ],
  },
  form: {
    kicker: 'Kontakt',
    h2: 'Be om en pilot, eller bare spør.',
    lead: 'Fortell litt om lageret, så svarer vi innen én arbeidsdag.',
    labels: { name: 'Navn', email: 'Jobb-e-post', company: 'Firma', role: 'Rolle', volume: 'Ordrer per dag', interest: 'Hva er dere mest interessert i?', message: 'Melding' },
    optional: 'valgfritt',
    choose: 'Velg',
    roles: {
      warehouse_manager: 'Lagersjef eller driftssjef',
      logistics_manager: 'Logistikksjef',
      owner: 'Daglig leder eller eier',
      it: 'IT',
      other: 'Annet',
    },
    volumes: { lt50: 'Under 50', '50_200': '50 til 200', '200_500': '200 til 500', '500_2000': `500 til 2${NBSP}000`, gt2000: `Over 2${NBSP}000` },
    interests: { packing: 'Pakking', returns: 'Retur', both: 'Begge' },
    messageHint: 'For eksempel hvilke varer som oftest blir forvekslet.',
    consentBefore: 'Vi bruker opplysningene bare til å svare deg. Les mer i ',
    consentLink: 'personvernerklæringen',
    consentAfter: '.',
    submit: 'Send',
    sending: 'Sender …',
    errors: {
      name: 'Skriv navnet ditt.',
      email: 'Skriv e-postadressen din, for eksempel navn@firma.no.',
      company: 'Skriv navnet på firmaet.',
      role: 'Velg en rolle fra lista.',
      volume: 'Velg et antall fra lista.',
      interest: 'Velg pakking, retur eller begge.',
      message: 'Meldingen kan være på høyst 2000 tegn.',
      tooFast: 'Det gikk for fort. Vent noen sekunder og send igjen.',
      rateLimited: 'For mange forsøk. Prøv igjen om litt.',
      failed: `Noe gikk galt. Prøv igjen, eller send e-post til ${CONTACT_EMAIL}.`,
    },
    errorSummary: 'Sjekk feltene som er merket.',
    sentTitle: 'Takk, {name}.',
    sentBefore: 'Vi har fått meldingen og svarer på e-post innen én arbeidsdag. Vil du se mer i mellomtiden, kan du ',
    sentTry: 'prøve pakkesjekken',
    sentOr: ' eller ',
    sentDemo: 'se hele demoen',
    sentAfter: '.',
  },
  footer: { builtBy: 'Laget av', privacy: 'Personvern', signIn: 'Logg inn', motto: 'Varer, ikke folk.' },
};

const en: LandingCopy = {
  meta: {
    title: 'Sjekkpunkt: catch the wrong item before the box is sealed',
    description:
      'A camera check on the handheld for warehouses that pack online orders. The wrong item or size is stopped at the packing bench, and every return gets a grade and a shelf, with photos. Ready for a pilot.',
    ogAlt: 'Sjekkpunkt on a handheld: "Wrong item" and a red frame around a black hoodie that is not in the order.',
  },
  anchors: { problem: 'the-problem', how: 'how-it-works', try: 'try-it', watch: 'watch-it', floor: 'warehouse-floor', pilot: 'pilot', faq: 'questions', form: 'form' },
  nav: { how: 'How it works', try: 'Try it', faq: 'Questions', signIn: 'Sign in', cta: 'Ask for a pilot', langLabel: 'Language', skip: 'Skip to content', menu: 'Sections' },
  hero: {
    eyebrow: 'For warehouses that pack online orders',
    h1: 'Catch the wrong item before the tape goes on.',
    lead: 'Sjekkpunkt is a camera check on the handheld. It compares the open box with the order before it is sealed, and gives every return a grade and a shelf by fixed rules, with photos.',
    cta: 'Ask for a pilot',
    secondary: 'See how it works',
    facts: ['Runs in the browser on Android', 'Six languages', 'Voice or buttons'],
    imageAlt: 'A handheld at the packing bench. The screen says "Wrong item" with a red frame around a black hoodie that is not in the order.',
  },
  problem: {
    kicker: 'The problem',
    h2: 'One wrong box turns into five new jobs.',
    scene:
      'The customer ordered the hoodie in L. The box held an M. Now there is a return, a new parcel, a support ticket and maybe a one-star review. And nobody in the warehouse knows why it happened.',
    cards: [
      {
        title: 'Day two for the temp.',
        text: 'It is November and the queue is long. Navy and black look the same under the strip lights, and M and L sit on the same shelf. Nobody has time to double-check.',
      },
      {
        title: 'The returns bench guesses.',
        text: 'Back on the shelf, to the outlet, or scrap? Every person judges it a little differently. And when the customer says it was the wrong item all along, there is no photo of what went out.',
      },
      {
        title: 'You hear it from customers.',
        text: 'Mix-ups show up as complaints and returns, weeks later. By then it is hard to see which items get confused, and where.',
      },
    ],
    exampleTitle: 'An example, not a measurement.',
    exampleText:
      '300 orders a day and one mistake in 200 parcels is 1.5 wrong parcels a day, about 30 a month. What does one cost you, with shipping both ways, a new parcel and support time?',
  },
  how: {
    kicker: 'How it works',
    h2: 'One check at the packing bench. One at the returns bench.',
    lead: 'Packers and returns staff use the handhelds they already have. The team lead sees how it all connects.',
    packing: {
      title: 'Packing',
      steps: [
        { title: 'Scan the order.', text: 'The packer sees the items, quantities and shelf locations.', shot: shot('en', 'pack-order', 'Order 2207 on the handheld: a navy hoodie in M and grey wool socks, with shelf locations.') },
        {
          title: 'Show the box.',
          text: 'One photo from above. Sjekkpunkt compares it with the order and marks every item.',
          shot: shot('en', 'pack-box', 'The photo of the box from above while Sjekkpunkt checks it against the order.'),
        },
        {
          title: 'Fix it, or seal it.',
          text: 'A wrong item gets a red frame and a note on what to swap. When a garment comes in several sizes, the app asks for a photo of the label, or the packer scans the barcode. Green means seal, and the photo is kept as packing evidence.',
          shot: shot('en', 'pack-ok', 'The box is right: green frames around both items, "Ready to seal".'),
        },
      ],
    },
    returns: {
      title: 'Returns',
      steps: [
        {
          title: 'Scan the return.',
          text: "The order, the customer's reason and the packing evidence from dispatch come up.",
          shot: shot('en', 'ret-load', "Return 1043 on the handheld with the customer's reason and the packing evidence from dispatch."),
        },
        {
          title: 'Take the photos the app asks for.',
          text: "Front, label, any damage and the customer's note.",
          shot: shot('en', 'ret-photos', 'The photo of the label inside the jacket, where the size is read: M, not L.'),
        },
        {
          title: 'Confirm grade and shelf.',
          text: 'The app proposes a grade from A to D and a shelf, following your grading guide. Your staff check and confirm. A refund never exceeds what the item cost. Unsure cases go to the team lead.',
          shot: shot('en', 'ret-decision', 'The proposal for the return: grade A and shelf C-14-2, ready to confirm.'),
        },
      ],
    },
    loop: {
      title: 'Returns make packing better',
      text: 'When the returns bench finds that a customer got the wrong size, it counts as a mix-up between two items. When the same mix-up happens three times in seven days, the packer has to show the label every time those two items are packed, until the team lead clears the alert.',
      shot: shot('en', 'loop-alert', 'A packing alert on the handheld: this jacket has been mixed up with size M, show the label.'),
    },
    teamLead: {
      title: 'For the team lead',
      text: 'Unsure returns arrive as short cases with photos, a proposal and a spoken summary in Norwegian. Approve, change with a reason, or reject. The overview shows which items get mixed up and how many parcels were stopped. Never numbers per employee.',
      shot: shot('en', 'lead-insights', "The team lead's overview (in Norwegian): which items get mixed up, and how many parcels were stopped."),
    },
  },
  try: {
    kicker: 'Try it',
    h2: 'Try a packing check.',
    lead: 'Order 2207 is a navy hoodie in M and a pair of wool socks. Someone packed a black hoodie. Tap through and see what the packer sees. This packer speaks Polish; the line underneath shows what the coach says.',
    next: 'Next',
    back: 'Back',
    soundOn: 'Turn sound on',
    soundOff: 'Turn sound off',
    restart: 'Start again',
    end: 'The parcel is right and sealed. The photo is kept as packing evidence.',
    fullDemo: 'Watch the full demo, with returns and the team lead',
    progress: 'Step {n} of {total}',
    loading: 'Loading the packing check …',
    stationLabel: 'The packing station in the demo',
    coach: 'Coach',
    packer: 'Packer',
    stepTitles: ['The order is ready', 'The packer speaks Polish', 'The coach reads the order', 'Check the box', 'Swap it and check again', 'Seal'],
  },
  watch: {
    kicker: 'Watch it',
    h2: 'See Sjekkpunkt at work, 25 seconds.',
    lead: 'From a wrong hoodie at the packing bench to the returns bench and the team lead.',
    videoLabel: 'Sjekkpunkt at work, 25 seconds',
  },
  floor: {
    kicker: 'On the floor',
    h2: 'Built for the warehouse floor.',
    points: [
      { title: "The packer's own language.", text: 'Screen and voice in Norwegian, English, Polish, Ukrainian, Romanian and Lithuanian. The team lead reads everything in Norwegian.' },
      { title: 'Voice when your hands are full.', text: 'Hold the talk button, or switch on hands-free. Every step also has a button, so nobody has to speak.' },
      { title: 'The devices you have.', text: 'Runs in Chrome on Android handhelds and phones with a rear camera. Nothing to install. The team lead uses a PC or a tablet.' },
      { title: 'A few seconds per box.', text: 'One photo from above. In our tests the answer came in 1 to 5 seconds. An answer that takes too long never turns green.' },
      { title: 'Items, not people.', text: 'The camera takes a photo only when someone taps or asks for one. Photos with a face in them are deleted at once. No statistics per employee, and voice is not recorded.' },
      { title: 'Safe to let in.', text: 'Data is stored in the EU. Every decision goes into a log that cannot be changed. A daily cap on AI costs, and when it is reached the app switches to buttons and barcodes.' },
    ],
  },
  pilot: {
    kicker: 'Pilot',
    h2: 'Ready for a pilot. Not yet proven in production.',
    lead: 'Sjekkpunkt is fully built, but it has not run on a real warehouse floor yet. That is why you see no customer logos or results here. We would rather show it on yours.',
    items: [
      { title: 'Four weeks.', text: 'One packing station and one returns bench, or just one of them.' },
      { title: 'You bring:', text: 'one or two Android handhelds or phones with a camera, an export of products and orders, a contact on the floor and the rules you use for returns today.' },
      {
        title: 'We do:',
        text: 'set Sjekkpunkt up with your products and returns rules, train the first people on the floor (about half an hour), follow up every day in the first week, and after four weeks show you what we saw: parcels stopped, mix-ups, return grades and what your staff thought.',
      },
      { title: 'Before we start:', text: 'a data processing agreement, and material you can use when you discuss the tool with employee representatives.' },
      { title: 'Price:', text: 'The pilot costs nothing.' },
      { title: 'After:', text: 'You decide whether to continue. No lock-in.' },
    ],
    cta: 'Ask for a pilot',
  },
  faq: {
    kicker: 'Questions',
    h2: 'What you will want to know.',
    items: [
      {
        q: 'Do we need new hardware?',
        a: 'Usually not. Sjekkpunkt runs in Chrome on Android, on handhelds and phones with a rear camera. Barcodes are read with the camera or typed in. Before the pilot we test on the devices you have.',
      },
      {
        q: 'Will it slow packing down?',
        a: 'Every box gets one photo from above. In our tests the answer came in 1 to 5 seconds. Garments that come in several sizes also need a photo of the label or a barcode scan, because the size cannot be seen from above. What that means for your pace, we measure in the pilot.',
      },
      {
        q: 'Our staff speak many languages.',
        a: 'That is why the screen and the voice come in six languages, and the coach switches when someone speaks another of them. Whatever a worker writes or says as a note is translated into Norwegian for the team lead. Missing a language? Tell us.',
      },
      {
        q: 'What about privacy and monitoring employees?',
        a: 'Sjekkpunkt checks items, not people. There are no statistics or rankings per employee, no background recording and no reading of emotions. Photos are deleted automatically after a period you set (30 days by default), and photos with a face are deleted at once. The warehouse is the data controller. Before the pilot you get a data processing agreement and the material you need to discuss the tool with employee representatives.',
      },
      {
        q: 'Does it work with our order system?',
        a: 'Today products, orders and returns are imported as CSV files, and every event (parcel checked, return decided, stock change) is stored in a fixed format a warehouse system can take in. How we connect Sjekkpunkt to your WMS or web shop, we agree in the pilot.',
      },
      {
        q: 'What if the camera gets it wrong?',
        a: 'When Sjekkpunkt is unsure, it says so and asks for a new photo, the label or the barcode. It never approves on a guess. A clearly wrong item cannot be overridden by the packer. If the camera still cannot read the label after two more tries, for example because of a polybag or glare, the packer can confirm by hand and pick a reason. At returns the app proposes and your staff confirm. How often it is wrong on your floor, we measure in the pilot.',
      },
      {
        q: 'What if the network or the AI service is down?',
        a: "Barcodes and manual confirmation work without image analysis. Unsure returns go to the team lead. When the day's AI budget is spent, the app switches to buttons only and says so on screen.",
      },
      {
        q: 'Where is the data stored?',
        a: 'The database and photos are in the EU (Stockholm). Image analysis and voice go through Google and ElevenLabs. Before a pilot with real data we set them up with EU storage and with no use of your data for training.',
      },
      {
        q: 'What does it cost?',
        a: 'The pilot is free. After it we agree a fixed price per station and month based on your volume, and you get the price before you decide.',
      },
      { q: 'Who is behind it?', a: 'Sjekkpunkt is built by Forsterk, a Norwegian agency that makes websites and digital tools.' },
    ],
  },
  form: {
    kicker: 'Contact',
    h2: 'Ask for a pilot, or just ask.',
    lead: 'Tell us a little about your warehouse, and we will reply within one working day.',
    labels: { name: 'Name', email: 'Work email', company: 'Company', role: 'Role', volume: 'Orders per day', interest: 'What interests you most?', message: 'Message' },
    optional: 'optional',
    choose: 'Choose',
    roles: {
      warehouse_manager: 'Warehouse or operations manager',
      logistics_manager: 'Logistics manager',
      owner: 'Managing director or owner',
      it: 'IT',
      other: 'Other',
    },
    volumes: { lt50: 'Under 50', '50_200': '50 to 200', '200_500': '200 to 500', '500_2000': '500 to 2,000', gt2000: 'Over 2,000' },
    interests: { packing: 'Packing', returns: 'Returns', both: 'Both' },
    messageHint: 'For example, which items get mixed up most often.',
    consentBefore: 'We use these details only to reply to you. Read more in the ',
    consentLink: 'privacy notice',
    consentAfter: '.',
    submit: 'Send',
    sending: 'Sending …',
    errors: {
      name: 'Please enter your name.',
      email: 'Please enter your email address, for example name@company.com.',
      company: 'Please enter your company name.',
      role: 'Please pick a role from the list.',
      volume: 'Please pick a number from the list.',
      interest: 'Please pick packing, returns or both.',
      message: 'The message can be at most 2,000 characters.',
      tooFast: 'That was quick. Wait a few seconds and send it again.',
      rateLimited: 'Too many attempts. Please try again in a little while.',
      failed: `Something went wrong. Try again, or email ${CONTACT_EMAIL}.`,
    },
    errorSummary: 'Please check the marked fields.',
    sentTitle: 'Thanks, {name}.',
    sentBefore: 'We have your message and will reply by email within one working day. Want to see more in the meantime? ',
    sentTry: 'Try the packing check',
    sentOr: ' or ',
    sentDemo: 'watch the full demo',
    sentAfter: '.',
  },
  footer: { builtBy: 'Built by', privacy: 'Privacy', signIn: 'Sign in', motto: 'Items, not people.' },
};

export const LANDING: Record<LandingLang, LandingCopy> = { nb, en };
