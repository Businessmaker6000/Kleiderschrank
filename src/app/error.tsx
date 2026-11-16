"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-4xl">Etwas ist schiefgelaufen</h1>
      <p className="mt-3 max-w-sm text-sm text-muted">Die Seite konnte nicht geladen werden. Bitte versuche es noch einmal.</p>
      <button type="button" onClick={reset} className="mt-7 h-12 rounded-full bg-primary px-6 text-sm font-medium text-primary-ink">
        Erneut versuchen
      </button>
    </main>
  );
}
