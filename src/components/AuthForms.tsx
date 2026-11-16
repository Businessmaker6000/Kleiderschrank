"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, ErrorText, Field, Input } from "./ui";

export function AuthFrame({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 font-display text-5xl leading-none">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{text}</p>
        <div className="mt-9">{children}</div>
      </div>
    </main>
  );
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);
const pinProps = { type: "password", inputMode: "numeric" as const, pattern: "[0-9]*", maxLength: 4, required: true, autoComplete: "off", className: "tracking-[0.6em]" };

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) return setError("Der PIN braucht vier Ziffern.");
    if (pin !== repeat) return setError("Die beiden PINs stimmen nicht überein.");
    setBusy(true);
    try {
      await api("/api/auth/setup", { body: { pin, setupCode: code }, redirectOn401: false });
      window.location.assign("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {needsCode && (
        <Field label="Setup-Code" hint="Das Codewort, das du in Vercel bei SETUP_CODE eingetragen hast.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
        </Field>
      )}
      <Field label="PIN" hint="Vier Ziffern. Damit öffnet ihr die App.">
        <Input {...pinProps} value={pin} onChange={(e) => setPin(digits(e.target.value))} />
      </Field>
      <Field label="PIN wiederholen">
        <Input {...pinProps} value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" loading={busy}>
        Einrichtung abschliessen
      </Button>
    </form>
  );
}
