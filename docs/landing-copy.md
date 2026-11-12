# Sjekkpunkt landing page: copy

Checkpoint 1 of `docs/landing-page-brief.md`. Norwegian (bokmål) was written first; the English is its own text, not a
translation. The owner approved all of it on 2026-11-12 ("go with your best recommendations"), including the pilot
offer, so the page publishes it as written.

## 0. Owner decisions (approved 2026-11-12)

The owner accepted every recommendation below as written.

1. **The pilot offer (section 9 of the page).** Length, scope, what it costs, and whether we promise to connect their
   order system during the pilot. The draft says four weeks, free, no lock-in, and keeps the integration promise soft.
2. **Reply time on the form.** The draft says "innen én arbeidsdag" / "within one working day".
3. **Contact address in the footer.** Proposal: `hei@forsterk.no` (it exists on forsterk.no). Leads are emailed to
   `odin@reachamplified.com` as the brief says.
4. **Price question in the FAQ.** The draft answer says the pilot is free and the price after it is agreed per station
   and month. Replace with real numbers if you have them.
5. **Things a pilot with real data needs first** (from `docs/privacy.md`, so the pilot text does not over-promise):
   Gemini on a paid tier or Vertex AI in the EU, ElevenLabs EU residency and zero retention, label redaction before
   upload, a DPA with the customer, and a native check of the pl, uk, ro and lt worker strings (still drafts). The page
   says "we set this up before the pilot" where it touches these, and nowhere claims they are done.

## 1. Audience

**Primary:** the person who answers for the warehouse floor: lagersjef, driftssjef, logistikksjef, head of operations.
A Norwegian online shop with its own warehouse, or a 3PL. Roughly 50 to 2,000 orders a day. Clothing, sport, outdoor,
beauty, home: many sizes and colours that look alike. Reads the page on a phone between two tasks. Has seen plenty of
software that promised to save time and added clicks.

**Second:** the owner or daglig leder, who cares about cost, reviews and returns, and will ask "what does it cost and
what does it need from us?"

They say: feilplukk, feilpakk, feil vare, feil størrelse, retur, returbenk, pakkebord, håndterminal, skanner,
ekstrahjelp, sesong, Black Week, kundeservice, reklamasjon, B-vare, outlet, kassere, lagerstyring (WMS), 3PL.
They do not say: løsning, plattform, AI-drevet, sømløs, optimalisere, verdiskaping.

## 2. The promise in one sentence

- **nb:** Sjekkpunkt stopper feil vare og feil størrelse før esken tapes igjen, og gir hver retur grad og hylle etter
  faste regler, med bilder.
- **en:** Sjekkpunkt catches the wrong item or size before the box is taped shut, and gives every return a grade and a
  shelf by fixed rules, with photos.

## 3. The pains (checked against the brief's list)

| Pain | What is true about it | Used on the page as |
|---|---|---|
| Wrong item, size or colour shipped | A return, a new parcel, support time, maybe a bad review. No cost figure we can source (see note) | The hoodie in M that should have been L |
| Peak season, temporary staff, many languages | Same-looking colours, sizes on the same shelf, no time to double-check | "Dag to for ekstrahjelpen" |
| Training takes time, people leave | Sjekkpunkt tells the worker what is wrong, in their language, at the moment it happens | Folded into the temp-worker scene and the language point |
| The returns bench | Grading by feel, varies by person; no photo of what was sent when the customer disputes it | "Returbenken gjetter" |
| No overview | The lead hears about mix-ups from complaints, weeks later | "Dere hører det fra kundene" |

**Industry figures: none on the page.** The only figures found for "share of returns caused by a wrong item" come from
US consumer surveys by a voice-picking vendor (Voxware, 2015 and 2019, reported as 23 %, 25 %, 41 % or 45 % depending
on the write-up and what was counted). They disagree with each other, are not Nordic, and a lagersjef would rightly
distrust them. Instead the page shows one worked **example** with round numbers, labelled as an example, and asks the
reader to put in their own.

## 4. Proof points (each one true of the product as built)

| Claim | Where it is true |
|---|---|
| One photo from above is compared with the order before sealing | Packing station, `lib/engine`, `/api/vision` |
| A wrong item gets a red frame and says what is wrong | Bounding boxes «Ikke i ordren», verdict «Feil vare» |
| The size is checked on the label (or by barcode) for items that come in several sizes | Engine 1.1.0, R3; decision "a size-variant item needs a size read" |
| It never approves on a guess; a slow answer is never green | P9 timeout, decision "unidentified items are uncertain, not wrong" |
| A confident wrong item cannot be overridden by the packer | P8 decision |
| The sealed box's photo is kept as packing evidence and shown at returns | Pack checks, returns scan shows packing evidence |
| Returns: photos, grade A to D, shelf, refund never above the order line | Grading guide, `applyOverride`, R16 |
| A customer note is read as information, never as an instruction | Prompt injection handling, 1043 test |
| Three of the same mix-up in seven days makes packing of that pair show the label | `app.check_pack_alert`, settings defaults |
| Team lead: cases with photos, a proposal and a Norwegian summary; approve, override, reject | M5 |
| Insights without numbers per employee | `insights_*` views, tested |
| Six languages on screen and by voice: nb, en, pl, uk, ro, lt | i18n, voice agents |
| Voice is optional, every step has a button | Rule in `CLAUDE.md`, tested |
| Runs in Chrome on Android handhelds and phones with a rear camera, no install | Addendum section 3 |
| Answer in 1 to 5 seconds per photo in our tests | Decision "Vision models and budget (M2)" |
| Photos deleted after a period the warehouse sets (30 days default), at once if a face is in them | Retention job, face rule |
| No voice recordings; conversation text deleted after 7 days at the voice provider | Agent config, tested |
| Stored in the EU (Stockholm); append-only audit log; daily spend caps with a switch to buttons and barcode | M8 |
| Products, orders and returns import as CSV; events in a fixed format a WMS can take | M7, integration events |

Things the page must **not** say: that it is in production anywhere, any customer name, any accuracy percentage, "all
data stays in the EU" (the AI providers are not on EU residency yet), that it works on iPhone (not tested), or that it
connects to a named WMS or shop platform today.

## 5. Objections and answers (source for the FAQ)

See the FAQ in sections 7 and 8; every answer there is built from the proof table above, and where the honest answer
is "we set that up together in the pilot", it says so.

## 6. Page outline

The brief's order, with three changes, each argued:

1. **Header:** mark, links to «Slik virker det», «Prøv», «Spørsmål» (desktop only), NB/EN switch, «Logg inn» (small),
   button «Be om en pilot».
2. **Hero** (dark): eyebrow for whom, headline, one line on what it is, two buttons, one line of facts. Visual: a real
   station screen at the moment it stops the wrong hoodie, in a handheld frame (see section 10).
3. **The problem** (dark): one scene, three pains, one labelled example.
4. **How it works** (light on dark, real screens): packing in three steps, returns in three steps, then the loop and
   the team lead as one block. *Change:* the loop gets its own short block, because "returns make packing stricter" is
   the one thing no barcode check does, and it answers "no overview".
5. **Try it:** the scripted packing check (order 2207), tap-through, sound off until turned on. Second tab for one
   return if it stays simple.
6. **Watch it:** the explainer video (checkpoint 3). Until then the 25 s launch video sits here, not in the hero.
7. **Built for the warehouse floor:** six short points.
8. **Honest stage + the pilot.** *Change:* the pilot section opens with where the product stands ("built, not yet
   proven on a real floor"). Saying it plainly is stronger than a missing logo row, and it turns the lack of proof
   into the reason for the pilot.
9. **Questions:** the objections, as `<details>` (works without JavaScript). *Change:* moved after the pilot, so the
   pilot's terms are read before the "what does it cost" answer refers to them, and the questions sit right above
   the form where the last doubts are.
10. **The form.**
11. **Footer.**

Other languages (pl, uk, ro, lt) get the English page: the buyer reads nb or en, and the worker languages are shown
inside the demo instead, where they prove a point.

URLs: Norwegian at `/`, English at `/en`, each with its own title, description, canonical and `hreflang` pair. A
signed-in user who opens `/` still goes to their station, as today.

---

## 7. Page copy: Norwegian (bokmål)

### Header
- Lenker: Slik virker det · Prøv · Spørsmål
- Språk: NB / EN
- Logg inn
- Knapp: **Be om en pilot**

### Hero
- Overtittel: For lagre som pakker netthandel
- **H1: Feil vare stoppes før esken tapes igjen.**
- Ingress: Sjekkpunkt er en kamerasjekk på håndterminalen. Den sammenligner esken med ordren før den forsegles, og gir
  hver retur grad og hylle etter faste regler, med bilder.
- Knapper: **Be om en pilot** · Se hvordan det virker
- Faktalinje: Kjører i nettleseren på Android · Seks språk · Stemme eller knapper
- Bildetekst (skjermleser): Håndterminal ved pakkebordet. Skjermen viser «Feil vare» og en rød ramme rundt en svart
  hettegenser som ikke hører til ordren.

### Problemet
- **H2: En feil eske blir fem nye oppgaver.**
- Scene: Kunden bestilte hettegenseren i L. I esken lå en M. Nå venter en retur, en ny pakke, en sak hos kundeservice
  og kanskje en anmeldelse med én stjerne. Og ingen på lageret vet hvorfor det skjedde.
- Tre kort:
  - **Dag to for ekstrahjelpen.** Det er november og køen er lang. Marineblått og svart ser likt ut under lysrørene,
    og M og L ligger i samme hylle. Ingen har tid til å sjekke etter.
  - **Returbenken gjetter.** Skal genseren tilbake på hylla, til outlet eller kasseres? Hver medarbeider vurderer litt
    ulikt. Og når kunden sier at det var feil vare fra start, finnes det ikke noe bilde av det som ble sendt.
  - **Dere hører det fra kundene.** Forvekslingene dukker opp som klager og returer, uker senere. Da er det vanskelig
    å se hvilke varer som blandes, og hvor.
- Eksempelboks: **Eksempel, ikke en måling.** 300 ordrer om dagen og én feil per 200 pakker blir 1,5 feil pakker hver
  dag, rundt 30 i måneden. Hva koster én hos dere, med frakt begge veier, ny pakke og tid i kundeservice?

### Slik virker det
- **H2: Én sjekk ved pakkebordet. Én ved returbenken.**
- Ingress: Pakkeren og returmedarbeideren bruker den håndterminalen de har. Teamlederen ser sammenhengen.

**Pakking**
1. **Skann ordren.** Pakkeren ser varene og hvor mange av hver.
2. **Vis esken.** Ett bilde ovenfra. Sjekkpunkt sammenligner det med ordren og merker hver vare.
3. **Rett feilen, eller forsegl.** Feil vare får rød ramme og beskjed om hva som skal byttes. Finnes plagget i flere
   størrelser, ber appen om et bilde av etiketten, eller pakkeren skanner strekkoden. Grønt betyr forsegl, og bildet
   lagres som pakkebevis.

**Retur**
1. **Skann returen.** Ordren, kundens grunn og pakkebeviset fra utsendingen kommer opp.
2. **Ta bildene appen ber om.** Forside, etikett, eventuelle skader og kundens lapp.
3. **Bekreft grad og hylle.** Appen foreslår grad A til D og hylle etter graderingsguiden deres. Medarbeideren sjekker
   og bekrefter. Refusjonen blir aldri høyere enn det varen kostet. Usikre saker går til teamlederen.

**Retur gjør pakkingen bedre**
- Når returbenken finner at kunden fikk feil størrelse, telles det som en forveksling mellom to varer. Skjer den samme
  forvekslingen tre ganger på sju dager, må pakkeren vise etiketten hver gang de to varene pakkes, til teamlederen
  fjerner varselet.
- **For teamlederen:** usikre returer kommer som korte saker med bilder, et forslag og en oppsummering på norsk.
  Godkjenn, endre med en begrunnelse, eller avvis. Oversikten viser hvilke varer som forveksles og hvor mange pakker
  som ble stoppet. Aldri tall per ansatt.

### Prøv selv
- **H2: Prøv en pakkesjekk.**
- Ingress: Ordre 2207 er en marineblå hettegenser i M og et par ullsokker. Noen har lagt i en svart genser. Trykk deg
  gjennom og se det pakkeren ser. Pakkeren her snakker polsk; teksten under viser hva coachen sier.
- Knapper: **Neste** · Tilbake · Slå på lyd / Slå av lyd · Begynn på nytt
- Avslutning: Pakken er riktig og forseglet. Bildet er lagret som pakkebevis.
- Lenke: Se hele demoen, med retur og teamleder

### Se det
- **H2: Hele flyten på 80 sekunder.**
- Ingress: Fra en feil genser ved pakkebordet til returbenken og teamlederen.
- (Til videoen er ferdig: «Se Sjekkpunkt i bruk, 25 sekunder.»)

### Bygget for lagergulvet
- **H2: Bygget for lagergulvet.**
- **Pakkerens eget språk.** Skjerm og stemme på norsk, engelsk, polsk, ukrainsk, rumensk og litauisk. Teamlederen
  leser alt på norsk.
- **Stemme når hendene er fulle.** Hold inne snakkeknappen, eller slå på håndfri. Hvert steg har også en knapp, så
  ingen må snakke.
- **Utstyret dere har.** Kjører i Chrome på Android-håndterminaler og -telefoner med kamera bak. Ingen app å
  installere. Teamlederen bruker PC eller nettbrett.
- **Noen sekunder per eske.** Ett bilde ovenfra. I testene våre kom svaret på 1 til 5 sekunder. Et svar som tar for
  lang tid, blir aldri grønt.
- **Varer, ikke folk.** Kameraet tar bilde bare når noen trykker eller ber om det. Bilder der et ansikt synes, slettes med en gang.
  Ingen statistikk per ansatt, og stemmen tas ikke opp.
- **Trygt å slippe inn.** Data lagres i EU. Hver beslutning skrives i en logg som ikke kan endres. Et daglig tak på
  AI-kostnader, og når taket er nådd, går appen over til knapper og strekkode.

### Pilot
- **H2: Klar for en pilot. Ikke prøvd i drift ennå.**
- Ingress: Sjekkpunkt er ferdig bygget, men har ikke vært i bruk på et ekte lager. Derfor finner du ingen kundelogoer
  eller resultattall her. Vi vil heller vise det på deres gulv.
- **Fire uker.** Én pakkestasjon og én returbenk, eller bare én av dem.
- **Dere stiller med:** én eller to Android-håndterminaler eller telefoner med kamera, en eksport av varer og ordrer,
  en kontaktperson på gulvet og reglene dere bruker for returer i dag.
- **Vi gjør:** setter opp Sjekkpunkt med varene og returreglene deres, lærer opp de første på gulvet (rundt en halvtime),
  følger opp hver dag den første uka, og legger fram det vi har sett etter fire uker: pakker som ble stoppet,
  forvekslinger, returgrader og hva medarbeiderne syntes.
- **Før start:** databehandleravtale, og underlag dere kan bruke når dere drøfter verktøyet med de tillitsvalgte.
- **Pris:** Piloten koster ingenting.
- **Etterpå:** Dere bestemmer om dere vil fortsette. Ingen binding.
- Knapp: **Be om en pilot**

### Spørsmål
- **H2: Det dere lurer på.**
- **Trenger vi ny maskinvare?** Som regel ikke. Sjekkpunkt kjører i Chrome på Android, på håndterminaler og telefoner
  med kamera bak. Strekkoder leses med kameraet eller skrives inn. Før piloten tester vi på enhetene dere har.
- **Blir pakkingen tregere?** Hver eske får ett bilde ovenfra. I testene våre kom svaret på 1 til 5 sekunder. Plagg som
  finnes i flere størrelser trenger i tillegg et bilde av etiketten eller en strekkode, fordi størrelsen ikke synes
  ovenfra. Hva det betyr for tempoet hos dere, måler vi i piloten.
- **Folkene våre snakker mange språk.** Derfor finnes skjerm og stemme på seks språk, og coachen bytter språk når noen
  snakker et annet av dem. Det medarbeideren skriver eller sier som merknad, oversettes til norsk for teamlederen.
  Mangler dere et språk, si fra.
- **Hva med personvern og kontroll av ansatte?** Sjekkpunkt kontrollerer varer, ikke folk. Det finnes ingen statistikk
  eller rangering per ansatt, ingen opptak i bakgrunnen og ingen tolking av følelser. Bilder slettes automatisk etter
  en periode dere bestemmer (30 dager som standard), og bilder med ansikt slettes med en gang. Lageret er
  behandlingsansvarlig. Før piloten får dere en databehandleravtale og underlaget dere trenger for å drøfte verktøyet
  med de tillitsvalgte.
- **Virker det med ordresystemet vårt?** I dag leses varer, ordrer og returer inn som CSV-filer, og hver hendelse
  (pakke sjekket, retur avgjort, lagerendring) lagres i et fast format som et lagersystem kan ta imot. Hvordan vi
  kobler Sjekkpunkt til deres lagersystem eller nettbutikk, avtaler vi i piloten.
- **Hva skjer hvis kameraet tar feil?** Er Sjekkpunkt usikker, sier den fra og ber om et nytt bilde, etiketten eller
  strekkoden. Den godkjenner aldri på gjetning. En vare som tydelig er feil, kan ikke pakkeren overstyre. Ser kameraet
  ikke etiketten etter to nye forsøk, for eksempel på grunn av plastpose eller gjenskinn, kan pakkeren bekrefte selv og
  velge en grunn. Ved retur foreslår appen, og medarbeideren bekrefter. Hvor ofte den tar feil hos dere, måler vi i
  piloten.
- **Hva om nettet eller AI-tjenesten er nede?** Strekkode og manuell bekreftelse virker uten bildeanalyse. Usikre
  returer går til teamlederen. Når dagens budsjett for AI er brukt opp, går appen over til bare knapper og sier det på
  skjermen.
- **Hvor lagres dataene?** Database og bilder ligger i EU (Stockholm). Bildeanalysen og stemmen går gjennom Google og
  ElevenLabs. Før en pilot med ekte data setter vi dem opp med lagring i EU og uten at dataene brukes til trening.
- **Hva koster det?** Piloten er gratis. Etter piloten avtaler vi en fast pris per stasjon og måned ut fra volumet
  deres, og dere får prisen før dere bestemmer dere.
- **Hvem står bak?** Sjekkpunkt er laget av Forsterk, et norsk byrå som lager nettsider og digitale verktøy.

### Skjema
- **H2: Be om en pilot, eller bare spør.**
- Ingress: Fortell litt om lageret, så svarer vi innen én arbeidsdag.
- Felt:
  - Navn
  - Jobb-e-post
  - Firma
  - Rolle: Lagersjef eller driftssjef · Logistikksjef · Daglig leder eller eier · IT · Annet
  - Ordrer per dag: Under 50 · 50 til 200 · 200 til 500 · 500 til 2 000 · Over 2 000
  - Hva er dere mest interessert i? Pakking · Retur · Begge
  - Melding (valgfritt). Hjelpetekst: For eksempel hvilke varer som oftest blir forvekslet.
- Samtykke: Vi bruker opplysningene bare til å svare deg. Les mer i [personvernerklæringen].
- Knapp: **Send**
- Feil:
  - Skriv navnet ditt.
  - Skriv e-postadressen din, for eksempel navn@firma.no.
  - Skriv navnet på firmaet.
  - Det gikk for fort. Vent noen sekunder og send igjen.
  - For mange forsøk. Prøv igjen om litt.
  - Noe gikk galt. Prøv igjen, eller send e-post til hei@forsterk.no.
- Sendt: **Takk, {fornavn}.** Vi har fått meldingen og svarer på e-post innen én arbeidsdag. Vil du se mer i mellomtiden,
  kan du [prøve pakkesjekken] eller [se hele demoen].

### Bunntekst
- Laget av [Forsterk](https://forsterk.no)
- Personvern · hei@forsterk.no · Logg inn
- Varer, ikke folk.

### SEO
- Tittel: Sjekkpunkt: stopp feil vare før esken tapes igjen
- Beskrivelse: Kamerasjekk på håndterminalen for lagre som pakker netthandel. Feil vare og feil størrelse stoppes ved
  pakkebordet, og hver retur får grad og hylle med bilder. Klar for pilot.

---

## 8. Page copy: English

### Header
- Links: How it works · Try it · Questions
- Language: NB / EN
- Sign in
- Button: **Ask for a pilot**

### Hero
- Eyebrow: For warehouses that pack online orders
- **H1: Catch the wrong item before the tape goes on.**
- Lead: Sjekkpunkt is a camera check on the handheld. It compares the open box with the order before it is sealed,
  and gives every return a grade and a shelf by fixed rules, with photos.
- Buttons: **Ask for a pilot** · See how it works
- Facts: Runs in the browser on Android · Six languages · Voice or buttons
- Image description: A handheld at the packing bench. The screen says "Wrong item" with a red frame around a black
  hoodie that is not in the order.

### The problem
- **H2: One wrong box turns into five new jobs.**
- Scene: The customer ordered the hoodie in L. The box held an M. Now there is a return, a new parcel, a support
  ticket and maybe a one-star review. And nobody in the warehouse knows why it happened.
- Three cards:
  - **Day two for the temp.** It is November and the queue is long. Navy and black look the same under the strip
    lights, and M and L sit on the same shelf. Nobody has time to double-check.
  - **The returns bench guesses.** Back on the shelf, to the outlet, or scrap? Every person judges it a little
    differently. And when the customer says it was the wrong item all along, there is no photo of what went out.
  - **You hear it from customers.** Mix-ups show up as complaints and returns, weeks later. By then it is hard to see
    which items get confused, and where.
- Example box: **An example, not a measurement.** 300 orders a day and one mistake in 200 parcels is 1.5 wrong parcels
  a day, about 30 a month. What does one cost you, with shipping both ways, a new parcel and support time?

### How it works
- **H2: One check at the packing bench. One at the returns bench.**
- Lead: Packers and returns staff use the handhelds they already have. The team lead sees how it all connects.

**Packing**
1. **Scan the order.** The packer sees the items and how many of each.
2. **Show the box.** One photo from above. Sjekkpunkt compares it with the order and marks every item.
3. **Fix it, or seal it.** A wrong item gets a red frame and a note on what to swap. When a garment comes in several
   sizes, the app asks for a photo of the label, or the packer scans the barcode. Green means seal, and the photo is
   kept as packing evidence.

**Returns**
1. **Scan the return.** The order, the customer's reason and the packing evidence from dispatch come up.
2. **Take the photos the app asks for.** Front, label, any damage and the customer's note.
3. **Confirm grade and shelf.** The app proposes a grade from A to D and a shelf, following your grading guide. Your
   staff check and confirm. A refund never exceeds what the item cost. Unsure cases go to the team lead.

**Returns make packing better**
- When the returns bench finds that a customer got the wrong size, it counts as a mix-up between two items. When the
  same mix-up happens three times in seven days, the packer has to show the label every time those two items are
  packed, until the team lead clears the alert.
- **For the team lead:** unsure returns arrive as short cases with photos, a proposal and a spoken summary in
  Norwegian. Approve, change with a reason, or reject. The overview shows which items get mixed up and how many
  parcels were stopped. Never numbers per employee.

### Try it
- **H2: Try a packing check.**
- Lead: Order 2207 is a navy hoodie in M and a pair of wool socks. Someone packed a black hoodie. Tap through and see
  what the packer sees. This packer speaks Polish; the line underneath shows what the coach says.
- Buttons: **Next** · Back · Turn sound on / Turn sound off · Start again
- End: The parcel is right and sealed. The photo is kept as packing evidence.
- Link: Watch the full demo, with returns and the team lead

### Watch it
- **H2: The whole flow in 80 seconds.**
- Lead: From a wrong hoodie at the packing bench to the returns bench and the team lead.
- (Until the video is ready: "See Sjekkpunkt at work, 25 seconds.")

### Built for the warehouse floor
- **H2: Built for the warehouse floor.**
- **The packer's own language.** Screen and voice in Norwegian, English, Polish, Ukrainian, Romanian and Lithuanian.
  The team lead reads everything in Norwegian.
- **Voice when your hands are full.** Hold the talk button, or switch on hands-free. Every step also has a button, so
  nobody has to speak.
- **The devices you have.** Runs in Chrome on Android handhelds and phones with a rear camera. Nothing to install.
  The team lead uses a PC or a tablet.
- **A few seconds per box.** One photo from above. In our tests the answer came in 1 to 5 seconds. An answer that
  takes too long never turns green.
- **Items, not people.** The camera takes a photo only when someone taps or asks for one. Photos with a face in them are deleted at
  once. No statistics per employee, and voice is not recorded.
- **Safe to let in.** Data is stored in the EU. Every decision goes into a log that cannot be changed. A daily cap on
  AI costs, and when it is reached the app switches to buttons and barcodes.

### Pilot
- **H2: Ready for a pilot. Not yet proven in production.**
- Lead: Sjekkpunkt is fully built, but it has not run on a real warehouse floor yet. That is why you see no customer
  logos or results here. We would rather show it on yours.
- **Four weeks.** One packing station and one returns bench, or just one of them.
- **You bring:** one or two Android handhelds or phones with a camera, an export of products and orders, a contact on
  the floor and the rules you use for returns today.
- **We do:** set Sjekkpunkt up with your products and returns rules, train the first people on the floor (about half
  an hour), follow up every day in the first week, and after four weeks show you what we saw: parcels stopped,
  mix-ups, return grades and what your staff thought.
- **Before we start:** a data processing agreement, and material you can use when you discuss the tool with employee
  representatives.
- **Price:** The pilot costs nothing.
- **After:** You decide whether to continue. No lock-in.
- Button: **Ask for a pilot**

### Questions
- **H2: What you will want to know.**
- **Do we need new hardware?** Usually not. Sjekkpunkt runs in Chrome on Android, on handhelds and phones with a rear
  camera. Barcodes are read with the camera or typed in. Before the pilot we test on the devices you have.
- **Will it slow packing down?** Every box gets one photo from above. In our tests the answer came in 1 to 5 seconds.
  Garments that come in several sizes also need a photo of the label or a barcode scan, because the size cannot be
  seen from above. What that means for your pace, we measure in the pilot.
- **Our staff speak many languages.** That is why the screen and the voice come in six languages, and the coach
  switches when someone speaks another of them. Whatever a worker writes or says as a note is translated into
  Norwegian for the team lead. Missing a language? Tell us.
- **What about privacy and monitoring employees?** Sjekkpunkt checks items, not people. There are no statistics or
  rankings per employee, no background recording and no reading of emotions. Photos are deleted automatically after a
  period you set (30 days by default), and photos with a face are deleted at once. The warehouse is the data
  controller. Before the pilot you get a data processing agreement and the material you need to discuss the tool with
  employee representatives.
- **Does it work with our order system?** Today products, orders and returns are imported as CSV files, and every
  event (parcel checked, return decided, stock change) is stored in a fixed format a warehouse system can take in.
  How we connect Sjekkpunkt to your WMS or web shop, we agree in the pilot.
- **What if the camera gets it wrong?** When Sjekkpunkt is unsure, it says so and asks for a new photo, the label or
  the barcode. It never approves on a guess. A clearly wrong item cannot be overridden by the packer. If the camera
  still cannot read the label after two more tries, for example because of a polybag or glare, the packer can confirm
  by hand and pick a reason. At returns the app proposes and your staff confirm. How often it is wrong on your floor,
  we measure in the pilot.
- **What if the network or the AI service is down?** Barcodes and manual confirmation work without image analysis.
  Unsure returns go to the team lead. When the day's AI budget is spent, the app switches to buttons only and says so
  on screen.
- **Where is the data stored?** The database and photos are in the EU (Stockholm). Image analysis and voice go
  through Google and ElevenLabs. Before a pilot with real data we set them up with EU storage and with no use of your
  data for training.
- **What does it cost?** The pilot is free. After it we agree a fixed price per station and month based on your
  volume, and you get the price before you decide.
- **Who is behind it?** Sjekkpunkt is built by Forsterk, a Norwegian agency that makes websites and digital tools.

### Form
- **H2: Ask for a pilot, or just ask.**
- Lead: Tell us a little about your warehouse, and we will reply within one working day.
- Fields:
  - Name
  - Work email
  - Company
  - Role: Warehouse or operations manager · Logistics manager · Managing director or owner · IT · Other
  - Orders per day: Under 50 · 50 to 200 · 200 to 500 · 500 to 2,000 · Over 2,000
  - What interests you most? Packing · Returns · Both
  - Message (optional). Hint: For example, which items get mixed up most often.
- Consent: We use these details only to reply to you. Read more in the [privacy notice].
- Button: **Send**
- Errors:
  - Please enter your name.
  - Please enter your email address, for example name@company.com.
  - Please enter your company name.
  - That was quick. Wait a few seconds and send it again.
  - Too many attempts. Please try again in a little while.
  - Something went wrong. Try again, or email hei@forsterk.no.
- Sent: **Thanks, {first name}.** We have your message and will reply by email within one working day. Want to see
  more in the meantime? [Try the packing check] or [watch the full demo].

### Footer
- Built by [Forsterk](https://forsterk.no)
- Privacy · hei@forsterk.no · Sign in
- Items, not people.

### SEO
- Title: Sjekkpunkt: catch the wrong item before the box is sealed
- Description: A camera check on the handheld for warehouses that pack online orders. The wrong item or size is
  stopped at the packing bench, and every return gets a grade and a shelf, with photos. Ready for a pilot.

---

## 9. Critique against brief section 5, and what the rewrite changed

First draft, read as a stressed lagersjef on a phone:

| First draft | Problem | Now |
|---|---|---|
| H1 «Riktig vare i hver eske» | A wish, not a scene; every WMS vendor could say it | «Feil vare stoppes før esken tapes igjen»: the moment on their floor |
| Ingress named returns, voice, languages and the team lead | Four ideas in the one line that must say what it is | Packing and returns only; languages and voice moved to the fact line |
| «Løsningen sjekker…» | Banned word | «Sjekkpunkt sjekker…», «appen» |
| «AI-basert bildegjenkjenning» in How it works | Mechanism before outcome, and a word they would not say | «Ett bilde ovenfra. Sjekkpunkt sammenligner det med ordren» |
| «Reduser feilplukk med opptil …» | An invented number | Removed; one labelled example and «måler vi i piloten» |
| Problem section opened with "Returer koster norsk netthandel milliarder" | No source we could read and trust | Opens with the hoodie scene |
| «Returbenken blir effektiv og konsistent» | Abstract, office words | «Hver medarbeider vurderer litt ulikt», then grade A to D and a shelf |
| Pilot section last before the footer | The "what does it cost" answer referred to a pilot not yet described | Pilot before the questions, questions right above the form |
| «Fungerer på alle enheter» | Not true (tested in Chrome on Android only) | «Kjører i Chrome på Android … Før piloten tester vi på enhetene dere har» |
| «All data i EU» | Not true today (Gemini and ElevenLabs are not on EU residency yet) | «Data lagres i EU», and a FAQ answer that says what is and is not |
| «Bilder lagres som bevis» | Photos are deleted after the retention period | «lagres som pakkebevis», with the retention period stated in the privacy answer |
| FAQ "Will it slow packing down?" said "no" | Clothing with sizes needs a label photo or a scan; that adds time | Says so, and says we measure it in the pilot |
| English H1 «Stop wrong items before the box is sealed» | Correct but flat; "sealed" is not how a packer thinks | «Catch the wrong item before the tape goes on.» |
| English "staff" and "workers" mixed | One word for one thing | "packer" for packing, "your staff" otherwise |

Second read, checks:

- Banned words (both languages): none of revolusjonerende, banebrytende, sømløs, innovativ, neste generasjon,
  løsning, AI-drevet, game-changer, seamless, cutting-edge, leverage, unlock, empower. "AI" appears only where the
  buyer would use it (the budget and the AI service being down).
- No em dash, no "--" or " - " as a dash. Ranges are written with words ("50 til 200", "1 til 5 sekunder").
- Every proof point traces to section 4. The pilot, the reply time, the price and the contact address are marked.
- Five-second test, nb: eyebrow (for whom) → H1 (what it gets you) → ingress (what it is) → button. En: the same.

---

## 10. Visual direction

Prototype of the hero and the "How it works" section, built on the real tokens and `sp-` components and shown to the
owner as screenshots at 390, 768 and 1440 px (kept outside the repo).

- **One dark page.** The whole landing page sits on `frame` with `frame-2` cards and `line-on-dark` rules, like the
  front page today. The design system allows the lime `brand` on dark pages, and here it is used for one thing: the
  primary button (plus the small dot on the eyebrow). Section kickers are mono caps in `ink-2-on-dark`.
- **Type.** Golos Text 800 for the headline (40 px on a phone, 60 px from 768, 72 px from 1280, tight tracking,
  balanced lines), 19 to 22 px for the lead, JetBrains Mono for kickers and step numbers. No new font.
- **Real screens are the imagery.** The hero shows the real station at the moment it stops the black hoodie («Feil
  vare», red frame, «Ikke i ordren», «Sjekk igjen») inside a plain graphite handheld frame. The status colours appear
  only inside product screens, so red and green on the page always mean what they mean at the bench.
- **How it works** is three numbered cards per tab (Pakking, Retur, Teamleder), each with a real screen cropped like a
  device top, so the row reads red to green from left to right.
- **Motion** will be small and explanatory: the hero screen can step from red to green once, the steps can reveal as
  they scroll in. Nothing moves under reduced motion.
- **For the build:** capture the screens from the live stations with seed data (`PACK_SHOTS`, `DEMO_SHOTS`,
  `LEAD_SHOTS`) at a handheld width, in nb and en, instead of the practice demo (its order card says «Velg en annen
  pakke», which a real station does not). Step 2 should show the box before the verdict, so it does not repeat the
  hero.
