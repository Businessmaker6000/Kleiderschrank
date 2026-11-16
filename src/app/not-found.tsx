import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-4xl">Seite nicht gefunden</h1>
      <Link href="/" className="mt-7 inline-flex h-12 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-ink">
        Zur Startseite
      </Link>
    </main>
  );
}
