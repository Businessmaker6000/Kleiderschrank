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

export function SetupForm({ needsCode }: { needsCode: boolean }) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) return setError("Das Passwort muss mindestens 10 Zeichen lang sein.");
    if (password !== repeat) return setError("Die beiden Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      await api("/api/auth/setup", { body: { password, setupCode: code }, redirectOn401: false });
      window.location.assign("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {needsCode && (
        <Field label="Setup-Code" hint="Der Wert der Umgebungsvariable SETUP_CODE auf dem Server.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
        </Field>
      )}
      <Field label="Gemeinsames Passwort" hint="Damit meldet ihr neue Geräte an. Mindestens 10 Zeichen.">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field label="Passwort wiederholen">
        <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" loading={busy}>
        Einrichtung abschliessen
      </Button>
      <p className="text-xs leading-relaxed text-muted">
        Danach gibt es die Profile Kole und Alisha, beide mit dem Start-PIN. Den PIN ändert ihr in den Einstellungen.
      </p>
    </form>
  );
}

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/login", { body: { password }, redirectOn401: false });
      window.location.assign("/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Passwort">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" loading={busy}>
        Anmelden
      </Button>
    </form>
  );
}
