// The privacy notice for the landing page form (landing page brief, section 9), shown on
// /privacy under the worker information. Norwegian and English; the other languages get English,
// like the landing page itself.

import { CONTACT_EMAIL } from './copy';

export interface LeadPrivacyText {
  id: string;
  title: string;
  intro: string;
  sections: { title: string; items: string[] }[];
}

export const LEAD_PRIVACY: Record<'nb' | 'en', LeadPrivacyText> = {
  nb: {
    id: 'henvendelser',
    title: 'Når du kontakter oss gjennom skjemaet',
    intro: 'Dette gjelder skjemaet «Be om en pilot, eller bare spør» på forsiden, ikke appen på lageret.',
    sections: [
      {
        title: 'Dette lagrer vi',
        items: [
          'Navn, jobb-e-post og firma, og det du velger å fylle inn om rolle, ordrer per dag, interesse og melding.',
          'Tidspunktet du sendte skjemaet, og om varselet til oss ble sendt.',
          'Vi lagrer ikke IP-adressen din. For å stoppe misbruk teller vi innsendinger per besøkende med en enveis kode (hash) av IP-adressen. Tellingen slettes etter et døgn.',
        ],
      },
      {
        title: 'Derfor',
        items: ['Bare for å svare deg og avtale en eventuell pilot. Vi sender ikke nyhetsbrev og deler ikke opplysningene med andre.'],
      },
      {
        title: 'Hvem som behandler dem',
        items: [
          'Forsterk er ansvarlig for opplysningene. De lagres i databasen til Sjekkpunkt i EU (Stockholm).',
          'Et varsel om henvendelsen sendes til oss på e-post gjennom e-posttjenesten Resend.',
        ],
      },
      {
        title: 'Så lenge',
        items: ['Henvendelsen slettes automatisk 12 måneder etter at du sendte den, eller før hvis du ber om det.'],
      },
      {
        title: 'Innsyn og sletting',
        items: [`Send e-post til ${CONTACT_EMAIL} hvis du vil se, rette eller slette det du har sendt oss. Vi svarer innen 30 dager, som regel samme uke.`],
      },
    ],
  },
  en: {
    id: 'contact-form',
    title: 'When you contact us through the form',
    intro: 'This covers the form "Ask for a pilot, or just ask" on the front page, not the app in the warehouse.',
    sections: [
      {
        title: 'What we store',
        items: [
          'Your name, work email and company, and what you choose to tell us about your role, orders per day, interest and message.',
          'When you sent the form, and whether the notice to us went out.',
          'We do not store your IP address. To stop abuse we count submissions per visitor with a one-way code (a hash) of the IP address. The count is deleted after a day.',
        ],
      },
      {
        title: 'Why',
        items: ['Only to reply to you and to arrange a pilot if you want one. We send no newsletters and share the details with nobody else.'],
      },
      {
        title: 'Who handles them',
        items: [
          'Forsterk is responsible for these details. They are stored in the Sjekkpunkt database in the EU (Stockholm).',
          'A notice about your message is emailed to us through the email service Resend.',
        ],
      },
      {
        title: 'How long',
        items: ['Your message is deleted automatically 12 months after you sent it, or sooner if you ask.'],
      },
      {
        title: 'Access and deletion',
        items: [`Email ${CONTACT_EMAIL} if you want to see, correct or delete what you sent us. We reply within 30 days, usually the same week.`],
      },
    ],
  },
};
