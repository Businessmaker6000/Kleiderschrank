"use client";

import { ChevronRight, KeyRound, LogOut, MapPin, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { PageHeader, switchProfile, useProfile } from "@/components/AppShell";
import { CityPicker } from "@/components/CityPicker";
import { Button, Chip, ErrorText, Field, Input, Sheet, Skeleton, useToast } from "@/components/ui";
import { api, useItems, useMe, useOutfits } from "@/lib/client/api";
import { useWeather } from "@/lib/client/weather";
import { GROUP_LABEL, STYLES } from "@/lib/taxonomy";

function Row({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-chip/60">
      <span className="text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{title}</span>
        {text && <span className="block truncate text-xs text-muted">{text}</span>}
      </span>
      <ChevronRight className="size-4 text-muted" aria-hidden />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  );
}

const card = "divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface";

export default function ProfilePage() {
  const profile = useProfile();
  const toast = useToast();
  const { data: me } = useMe();
  const { items } = useItems();
  const { outfits } = useOutfits();
  const { weather, status } = useWeather();
  const [sheet, setSheet] = useState<"pin" | "password" | "city" | null>(null);

  async function toggleStyle(style: string) {
    if (!me) return;
    const current = me.prefs.favorite_styles;
    const next = current.includes(style) ? current.filter((s) => s !== style) : [...current, style].slice(-6);
    try {
      await mutate("/api/me", api("/api/preferences", { method: "PATCH", body: { favorite_styles: next } }).then(() => ({ ...me, prefs: { ...me.prefs, favorite_styles: next } })), {
        optimisticData: { ...me, prefs: { ...me.prefs, favorite_styles: next } },
        rollbackOnError: true,
        revalidate: false,
      });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function removeCategory(id: string) {
    try {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      await mutate("/api/me");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/login");
  }

  const location =
    status === "ready" && weather
      ? `${weather.place || "Aktueller Standort"} · ${weather.temp} °C`
      : me?.prefs.city || (status === "needs-permission" ? "Noch nicht freigegeben" : status === "denied" ? "Kein Standort" : "Wird ermittelt …");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Profil" title={profile.name} />

      <div className="space-y-9">
        <div className="grid grid-cols-3 gap-3">
          {[
            { n: items?.length, label: "Teile" },
            { n: outfits?.length, label: "Outfits" },
            { n: items?.filter((i) => i.favorite).length, label: "Favoriten" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-tile p-4">
              {s.n === undefined ? <Skeleton className="h-9 w-10 rounded-lg" /> : <p className="font-display text-4xl leading-none">{s.n}</p>}
              <p className="eyebrow mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        <Section title="Dein Stil">
          <p className="mb-3 text-sm text-muted">Stilrichtungen, die du magst. Der Generator bevorzugt passende Kombinationen.</p>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <Chip key={s} active={!!me?.prefs.favorite_styles.includes(s)} onClick={() => toggleStyle(s)} disabled={!me}>
                {s}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Wetter">
          <div className={card}>
            <Row icon={<MapPin className="size-5" strokeWidth={1.5} />} title="Standort" text={location} onClick={() => setSheet("city")} />
          </div>
        </Section>

        {me && me.categories.length > 0 && (
          <Section title="Eigene Kategorien">
            <ul className={card}>
              {me.categories.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.name}</span>
                    <span className="block text-xs text-muted">{GROUP_LABEL[c.group]}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCategory(c.id)}
                    aria-label={`Kategorie ${c.name} löschen`}
                    className="flex size-11 items-center justify-center rounded-full text-muted transition hover:bg-chip hover:text-danger"
                  >
                    <Trash2 className="size-4" strokeWidth={1.6} />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Sicherheit">
          {me && !me.pinChanged && (
            <p className="mb-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
              Du verwendest noch den Start-PIN. Lege am besten einen eigenen fest.
            </p>
          )}
          <div className={card}>
            <Row icon={<KeyRound className="size-5" strokeWidth={1.5} />} title="PIN ändern" text="Vierstelliger PIN für dein Profil" onClick={() => setSheet("pin")} />
            <Row
              icon={<ShieldCheck className="size-5" strokeWidth={1.5} />}
              title="Gemeinsames Passwort ändern"
              text="Meldet alle anderen Geräte ab"
              onClick={() => setSheet("password")}
            />
          </div>
        </Section>

        <Section title="Sitzung">
          <div className={card}>
            <Row icon={<Users className="size-5" strokeWidth={1.5} />} title="Profil wechseln" text="Sperrt dein Profil auf diesem Gerät" onClick={() => void switchProfile()} />
            <Row icon={<LogOut className="size-5" strokeWidth={1.5} />} title="Gerät abmelden" text="Danach ist wieder das Passwort nötig" onClick={logout} />
          </div>
        </Section>

        <p className="text-center text-xs leading-relaxed text-muted">
          Tipp: Über „Zum Home-Bildschirm“ im Teilen-Menü deines Browsers installierst du Wardrobe wie eine App.
        </p>
      </div>

      {sheet === "pin" && <PinSheet onClose={() => setSheet(null)} />}
      {sheet === "password" && <PasswordSheet onClose={() => setSheet(null)} />}
      <CityPicker open={sheet === "city"} onClose={() => setSheet(null)} />
    </div>
  );
}

function PinSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length !== 4) return setError("Der neue PIN braucht vier Ziffern.");
    if (next !== repeat) return setError("Die beiden neuen PINs stimmen nicht überein.");
    setBusy(true);
    try {
      await api("/api/auth/pin", { body: { current, next }, redirectOn401: false });
      await mutate("/api/me");
      toast("PIN geändert");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pinProps = { type: "password", inputMode: "numeric" as const, pattern: "[0-9]*", maxLength: 4, required: true, className: "tracking-[0.6em]" };
  return (
    <Sheet open onClose={onClose} title="PIN ändern">
      <form onSubmit={submit} className="space-y-5 pt-2">
        <Field label="Aktueller PIN">
          <Input {...pinProps} value={current} onChange={(e) => setCurrent(digits(e.target.value))} autoComplete="off" autoFocus />
        </Field>
        <Field label="Neuer PIN">
          <Input {...pinProps} value={next} onChange={(e) => setNext(digits(e.target.value))} autoComplete="off" />
        </Field>
        <Field label="Neuen PIN wiederholen">
          <Input {...pinProps} value={repeat} onChange={(e) => setRepeat(digits(e.target.value))} autoComplete="off" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" loading={busy}>
          PIN speichern
        </Button>
      </form>
    </Sheet>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 10) return setError("Das neue Passwort muss mindestens 10 Zeichen lang sein.");
    if (next !== repeat) return setError("Die beiden neuen Passwörter stimmen nicht überein.");
    setBusy(true);
    try {
      await api("/api/auth/password", { body: { current, next }, redirectOn401: false });
      toast("Passwort geändert");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Passwort ändern">
      <form onSubmit={submit} className="space-y-5 pt-2">
        <p className="text-sm leading-relaxed text-muted">Das Passwort gilt für euch beide. Alle anderen Geräte müssen sich danach neu anmelden.</p>
        <Field label="Aktuelles Passwort">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="Neues Passwort">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Field label="Neues Passwort wiederholen">
          <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" loading={busy}>
          Passwort speichern
        </Button>
      </form>
    </Sheet>
  );
}
