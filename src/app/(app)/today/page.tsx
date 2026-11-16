"use client";

import { Bookmark, Check, CloudOff, MapPin, Pencil, Shirt, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/components/AppShell";
import { CityPicker } from "@/components/CityPicker";
import { Collage, resolveItems } from "@/components/Collage";
import { SaveOutfitSheet } from "@/components/SaveOutfitSheet";
import { Button, EmptyState, Skeleton } from "@/components/ui";
import { useItems, useMe, useOutfits } from "@/lib/client/api";
import { useWeather } from "@/lib/client/weather";
import { describeOutfit, generateOutfit, seededRng } from "@/lib/outfit/generator";
import { SLOTS, seasonForMonth } from "@/lib/taxonomy";
import type { Item } from "@/lib/types";

function greeting(hour: number) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const localDate = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export default function TodayPage() {
  const profile = useProfile();
  const router = useRouter();
  const { items } = useItems();
  const { outfits } = useOutfits();
  const { data: me } = useMe();
  const { weather, status, requestLocation, refresh } = useWeather();
  const [now, setNow] = useState<Date | null>(null);
  const [roll, setRoll] = useState(0);
  const [saving, setSaving] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const rollKey = `wd:today:${profile.id}`;
  useEffect(() => {
    // the date and the day's re-roll count only exist in the browser
    const d = new Date();
    /* eslint-disable react-hooks/set-state-in-effect */
    setNow(d);
    try {
      const stored = JSON.parse(localStorage.getItem(rollKey) || "null");
      if (stored?.date === localDate(d)) setRoll(stored.roll || 0);
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [rollKey]);

  function surprise() {
    const next = roll + 1;
    setRoll(next);
    try {
      localStorage.setItem(rollKey, JSON.stringify({ date: localDate(new Date()), roll: next }));
    } catch {}
  }

  const weatherSettled = status !== "loading";
  // Same day + same wardrobe + same weather = same suggestion; "Surprise Me" moves to the next one.
  const today = useMemo(() => {
    if (!items?.length || !outfits || !now || !weatherSettled) return null;
    return generateOutfit(items, {
      // weather, place and time of day decide; "Surprise Me" loosens the pick
      mode: roll === 0 ? "auto" : "surprise",
      weather,
      when: { hour: now.getHours(), weekend: now.getDay() === 0 || now.getDay() === 6 },
      season: seasonForMonth(now.getMonth()),
      // outfits saved today are left out, so saving today's suggestion does not change it
      history: outfits
        .filter((o) => localDate(new Date(o.created_at)) !== localDate(now))
        .map((o) => ({ ids: o.items.map((i) => i.item_id), worn: o.worn_count })),
      favoriteStyles: me?.prefs.favorite_styles,
      rng: seededRng(`${localDate(now)}|${profile.id}|${roll}`),
    });
  }, [items, outfits, now, weatherSettled, weather, roll, me?.prefs.favorite_styles, profile.id]);

  const chosen = useMemo(() => (today && items ? resolveItems(today.selection, items) : {}), [today, items]);
  const chosenList = SLOTS.map((s) => chosen[s]).filter(Boolean) as Item[];
  const alreadySaved = useMemo(() => {
    const ids = chosenList.map((i) => i.id).sort().join();
    return !!ids && !!outfits?.some((o) => o.items.map((i) => i.item_id).sort().join() === ids);
  }, [chosenList, outfits]);

  return (
    <div className="mx-auto max-w-xl md:max-w-none">
      <section className="mb-8 md:mb-10">
        <p className="eyebrow min-h-4">
          {now?.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="mt-2 font-display text-[2.6rem] leading-[1.05] md:text-6xl">
          {now ? greeting(now.getHours()) : "Hello"}, {profile.name}.
        </h1>

        <div className="mt-5 min-h-12" aria-live="polite">
          {status === "loading" && <Skeleton className="h-12 w-64 rounded-xl" />}
          {status === "ready" && weather && (
            <div className="flex items-end gap-4">
              <p className="font-display text-5xl leading-none">{weather.temp}°</p>
              <div className="text-sm leading-snug">
                <button type="button" onClick={() => setCityOpen(true)} className="flex items-center gap-1 hover:underline" aria-label="Standort ändern">
                  <MapPin className="size-3.5 text-accent" aria-hidden />
                  {weather.place || "Aktueller Standort"} · {weather.label}
                </button>
                <p className="text-muted">
                  Gefühlt {weather.feels}° · Regen {weather.rainProb} % · Wind {weather.wind} km/h · {weather.low}°/{weather.high}°
                </p>
              </div>
            </div>
          )}
          {(status === "needs-permission" || status === "denied") && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-1 w-full text-sm text-muted sm:w-auto">
                {status === "denied" ? "Kein Standort verfügbar." : "Für Outfits passend zum Wetter:"}
              </p>
              {status === "needs-permission" && (
                <Button size="sm" variant="outline" onClick={requestLocation}>
                  <MapPin className="size-4" aria-hidden /> Standort verwenden
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setCityOpen(true)}>
                Stadt wählen
              </Button>
            </div>
          )}
          {status === "unavailable" && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <CloudOff className="size-4" aria-hidden /> Wetter gerade nicht verfügbar – Vorschlag nach Jahreszeit.
              <button type="button" onClick={refresh} className="text-ink underline underline-offset-4">
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </section>

      {!items || !outfits || (items.length > 0 && !today) ? (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-12">
          <Skeleton className="aspect-[4/5]" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Shirt className="size-6" strokeWidth={1.4} />}
          title="Dein Kleiderschrank wartet"
          text="Lade deine ersten Kleidungsstücke hoch – danach findest du hier jeden Tag ein Outfit passend zum Wetter."
          action={
            <Link href="/wardrobe">
              <Button>Erste Kleidungsstücke hochladen</Button>
            </Link>
          }
        />
      ) : (
        today && (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:items-center md:gap-12">
            <Collage items={chosen} eager />
            <div>
              <p className="eyebrow">Today&apos;s Outfit</p>
              <p className="mt-3 font-display text-3xl leading-snug md:text-4xl">{today.explanation}</p>
              <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                {chosenList.map((i) => (
                  <li key={i.id}>{i.name}</li>
                ))}
              </ul>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                <Button
                  className="col-span-2"
                  onClick={() => {
                    try {
                      sessionStorage.setItem("wd:draft", JSON.stringify(today.selection));
                    } catch {}
                    router.push("/create");
                  }}
                >
                  <Pencil className="size-4" aria-hidden /> Create Outfit
                </Button>
                <Button variant="outline" onClick={surprise}>
                  <Sparkles className="size-4" aria-hidden /> Surprise Me
                </Button>
                <Button variant="outline" onClick={() => setSaving(true)} disabled={alreadySaved}>
                  {alreadySaved ? <Check className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
                  {alreadySaved ? "Gespeichert" : "Save Outfit"}
                </Button>
              </div>
            </div>
          </section>
        )
      )}

      {saving && today && (
        <SaveOutfitSheet
          key={`${roll}`}
          items={chosen}
          defaults={{ ...describeOutfit(chosenList), note: today.explanation, weather }}
          onClose={() => setSaving(false)}
        />
      )}
      <CityPicker open={cityOpen} onClose={() => setCityOpen(false)} />
    </div>
  );
}
