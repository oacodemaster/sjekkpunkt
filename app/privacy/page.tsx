import Link from 'next/link';

// Full worker information screen in every enabled language comes in M7.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6 text-lg">
      <h1 className="text-3xl font-bold">Personvern · Privacy</h1>
      <ul className="list-disc space-y-2 pl-6">
        <li>Kameraet tar bilde av varer bare når du trykker. · The camera photographs items only when you tap.</li>
        <li>Mikrofonen lytter bare mens du holder inne snakkeknappen. · The microphone listens only while you hold the talk button.</li>
        <li>Ingen bakgrunnsopptak, ingen ansikter, ingen måling av ansatte. · No background recording, no faces, no performance scores.</li>
      </ul>
      <Link href="/" className="text-accent underline">
        Tilbake · Back
      </Link>
    </main>
  );
}
