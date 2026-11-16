"use client";

import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, Lock, LockOpen, Shirt, Shuffle, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Collage, ItemImage, resolveItems } from "@/components/Collage";
import { SaveOutfitSheet } from "@/components/SaveOutfitSheet";
import { Button, Chip, ChipRow, EmptyState, IconButton, Sheet, Skeleton, cx } from "@/components/ui";
import { useItems, useMe, useOutfits } from "@/lib/client/api";
import { useWeather } from "@/lib/client/weather";
import { candidatesFor, cycleSlot, describeOutfit, explainOutfit, generateOutfit, scoreOutfit } from "@/lib/outfit/generator";
import type { GenOptions, Mode, Selection } from "@/lib/outfit/generator";
import { OCCASIONS, SLOTS, SLOT_LABEL, STYLES, seasonForMonth } from "@/lib/taxonomy";
import type { Slot } from "@/lib/taxonomy";
import type { Item, Outfit } from "@/lib/types";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "random", label: "Random", hint: "Frei kombiniert – Farben und Stil passen trotzdem zusammen." },
  { id: "style", label: "Style", hint: "Wähle eine Stilrichtung." },
  { id: "weather", label: "Weather", hint: "Abgestimmt auf das aktuelle Wetter." },
  { id: "occasion", label: "Occasion", hint: "Wähle einen Anlass." },
  { id: "surprise", label: "Surprise me", hint: "Mutigere, neue Kombinationen." },
];

const DRAFT_KEY = "wd:draft";

export default function CreatePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto aspect-[4/5] max-w-md" />}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const params = useSearchParams();
  const router = useRouter();
  const { items } = useItems();
  const { outfits } = useOutfits();
  const { data: me } = useMe();
  const { weather, status: weatherStatus } = useWeather();

  const [sel, setSel] = useState<Selection>({});
  const [locked, setLocked] = useState<Partial<Record<Slot, boolean>>>({});
  const [active, setActive] = useState<Slot | null>(null);
  const [mode, setMode] = useState<Mode>("random");
  const [style, setStyle] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>(null);
  const [editing, setEditing] = useState<Outfit | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const started = useRef(false);

  const season = seasonForMonth(new Date().getMonth());
  const history = useMemo(() => (outfits || []).map((o) => ({ ids: o.items.map((i) => i.item_id), worn: o.worn_count })), [outfits]);

  const options = useCallback(
    (m: Mode): GenOptions => ({
      mode: m,
      style: m === "style" ? style : null,
      occasion: m === "occasion" ? occasion : null,
      // "random" ignores live weather on purpose; every other mode respects it when available
      weather: m === "random" ? null : weather,
      season,
      history,
      favoriteStyles: me?.prefs.favorite_styles,
    }),
    [style, occasion, weather, season, history, me?.prefs.favorite_styles],
  );

  const generate = useCallback(
    (m: Mode = mode, keep: Selection = {}, current: Selection = sel) => {
      if (!items?.length) return;
      const g = generateOutfit(items, { ...options(m), locked: keep, current });
      if (g) setSel(g.selection);
    },
    [items, mode, sel, options],
  );

  const lockedSelection = useCallback(
    () => Object.fromEntries(SLOTS.filter((s) => locked[s] && sel[s]).map((s) => [s, sel[s]])) as Selection,
    [locked, sel],
  );

  // first render with data: open a saved outfit, build around a piece, continue a draft, or generate
  useEffect(() => {
    if (started.current || !items || !outfits) return;
    if (!items.length) return;
    // weather may still be loading; wait briefly so the first suggestion can use it
    if (weatherStatus === "loading") return;
    started.current = true;
    const outfitId = params.get("outfit");
    const aroundId = params.get("around");
    const saved = outfitId ? outfits.find((o) => o.id === outfitId) : null;
    const around = aroundId ? items.find((i) => i.id === aroundId) : null;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time initialisation from URL / storage */
    if (saved) {
      setEditing(saved);
      setSel(Object.fromEntries(saved.items.filter((e) => items.some((i) => i.id === e.item_id)).map((e) => [e.slot, e.item_id])));
      return;
    }
    if (around) {
      setLocked({ [around.slot]: true });
      setActive(around.slot);
      const g = generateOutfit(items, { ...options("around"), locked: { [around.slot]: around.id } });
      if (g) setSel(g.selection);
      return;
    }
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") as Selection | null;
      sessionStorage.removeItem(DRAFT_KEY);
      if (draft && Object.values(draft).every((id) => items.some((i) => i.id === id)) && Object.keys(draft).length) {
        setSel(draft);
        return;
      }
    } catch {}
    const first: Mode = weather ? "weather" : "random";
    setMode(first);
    const g = generateOutfit(items, options(first));
    if (g) setSel(g.selection);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [items, outfits, params, weather, weatherStatus, options]);

  const cycle = useCallback(
    (slot: Slot, dir: 1 | -1) => {
      if (!items) return;
      setSel((s) => cycleSlot(items, s, slot, dir));
      setActive(slot);
    },
    [items],
  );

  // arrow keys: left/right swap the selected piece, up/down move between pieces
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (picker || saving || el.closest("input, textarea, select, [role=dialog]")) return;
      const present = SLOTS.filter((s) => sel[s]);
      if (!present.length) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const slot = active && sel[active] ? active : present[0];
        if (locked[slot]) return;
        e.preventDefault();
        cycle(slot, e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = active ? present.indexOf(active) : -1;
        setActive(present[(i + (e.key === "ArrowDown" ? 1 : -1) + present.length) % present.length]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, sel, locked, picker, saving, cycle]);

  const chosen = useMemo(() => resolveItems(sel, items || []), [sel, items]);
  const chosenList = useMemo(() => SLOTS.map((s) => chosen[s]).filter(Boolean) as Item[], [chosen]);
  const counts = useMemo(
    () => Object.fromEntries(SLOTS.map((s) => [s, items ? candidatesFor(items, s).length : 0])) as Record<Slot, number>,
    [items],
  );
  const scored = useMemo(() => (chosenList.length ? scoreOutfit(chosenList, options(mode)) : null), [chosenList, options, mode]);
  const explanation = useMemo(() => (chosenList.length ? explainOutfit(chosenList, options(mode)) : ""), [chosenList, options, mode]);

  if (!items || !outfits) return <Skeleton className="mx-auto aspect-[4/5] max-w-md" />;

  if (items.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Outfit Builder" title="Create" />
        <EmptyState
          icon={<Shirt className="size-6" strokeWidth={1.4} />}
          title="Erst der Kleiderschrank"
          text="Sobald du Kleidungsstücke hochgeladen hast, stellst du hier Outfits daraus zusammen."
          action={
            <Link href="/wardrobe">
              <Button>Zum Kleiderschrank</Button>
            </Link>
          }
        />
      </>
    );
  }

  const dressMode = !!sel.dress;
  const canDress = counts.dress > 0;
  const canSeparates = counts.top + counts.bottom > 0;
  const placeholders = SLOTS.filter((s) => {
    if (sel[s] || !counts[s]) return false;
    if (dressMode) return s !== "top" && s !== "bottom";
    return s !== "dress";
  });

  function switchBase(toDress: boolean) {
    setLocked((l) => ({ ...l, top: false, bottom: false, dress: false }));
    const keep: Selection = { ...sel };
    delete keep.top;
    delete keep.bottom;
    delete keep.dress;
    // let the generator choose the new base piece(s) that go best with everything that stays
    const pool = items!.filter((i) => (toDress ? i.slot !== "top" && i.slot !== "bottom" : i.slot !== "dress"));
    const g = generateOutfit(pool, { ...options(mode), locked: keep })?.selection || {};
    if (toDress) setSel({ ...keep, ...(g.dress ? { dress: g.dress } : {}) });
    else setSel({ ...keep, ...(g.top ? { top: g.top } : {}), ...(g.bottom ? { bottom: g.bottom } : {}) });
    setActive(null);
  }

  const activeItem = active ? chosen[active] : undefined;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const anyLocked = SLOTS.some((s) => locked[s] && sel[s]);

  return (
    <>
      <PageHeader eyebrow={editing ? `Bearbeiten · ${editing.name}` : "Outfit Builder"} title="Create" />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-12">
        <div>
          <Collage
            items={chosen}
            eager
            edit={{
              placeholders,
              active,
              locked,
              counts,
              onActivate: (s) => setActive(active === s ? null : s),
              onCycle: cycle,
              onAdd: (s) => setPicker(s),
            }}
          />

          {/* controls for the selected piece */}
          <div className="mt-3 min-h-[4.25rem]">
            {activeItem && active ? (
              <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface py-2 pr-1 pl-4">
                <button type="button" onClick={() => setPicker(active)} className="min-w-0 flex-1 text-left">
                  <span className="eyebrow block">{SLOT_LABEL[active]}</span>
                  <span className="block truncate text-sm">{activeItem.name}</span>
                </button>
                <IconButton label="Vorheriges Teil" onClick={() => cycle(active, -1)} disabled={locked[active] || counts[active] < 2}>
                  <ChevronLeft className="size-5" strokeWidth={1.6} />
                </IconButton>
                <IconButton label="Nächstes Teil" onClick={() => cycle(active, 1)} disabled={locked[active] || counts[active] < 2}>
                  <ChevronRight className="size-5" strokeWidth={1.6} />
                </IconButton>
                <IconButton
                  label={locked[active] ? "Sperre aufheben" : "Teil sperren – bleibt beim Generieren erhalten"}
                  aria-pressed={!!locked[active]}
                  onClick={() => setLocked((l) => ({ ...l, [active]: !l[active] }))}
                  className={cx(locked[active] && "bg-primary text-primary-ink hover:bg-primary")}
                >
                  {locked[active] ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                </IconButton>
                <IconButton
                  label="Aus dem Outfit entfernen"
                  onClick={() => {
                    setSel((s) => {
                      const next = { ...s };
                      delete next[active];
                      return next;
                    });
                    setLocked((l) => ({ ...l, [active]: false }));
                    setActive(null);
                  }}
                >
                  <Trash2 className="size-4" strokeWidth={1.6} />
                </IconButton>
              </div>
            ) : (
              <p className="px-1 pt-3 text-center text-xs leading-relaxed text-muted">
                Pfeile wechseln ein Teil. Tippe ein Teil an, um es zu sperren, auszuwählen oder zu entfernen.
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-7">
          <div>
            <p className="font-display text-2xl leading-snug md:text-3xl">{explanation}</p>
            {scored && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowScore(!showScore)}
                  aria-expanded={showScore}
                  className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-ink"
                >
                  <span className="eyebrow">Match {Math.round(scored.total * 100)} %</span>
                  <ChevronDown className={cx("size-3.5 transition", showScore && "rotate-180")} aria-hidden />
                </button>
                {showScore && (
                  <ul className="mt-3 space-y-2.5 rounded-2xl border border-line bg-surface p-4">
                    {scored.parts.map((p) => (
                      <li key={p.key} className="flex items-center gap-3 text-xs">
                        <span className="w-36 shrink-0 truncate text-muted">{p.label}</span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-chip">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(p.value * 100)}%` }} />
                        </span>
                        <span className="w-9 text-right tabular-nums">{Math.round(p.value * 100)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="eyebrow mb-2.5">Generator</p>
            <ChipRow label="Modus">
              {MODES.map((m) => (
                <Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
                  {m.label}
                </Chip>
              ))}
            </ChipRow>
            <p className="mt-3 text-sm text-muted">
              {mode === "weather"
                ? weather
                  ? `${weather.temp} °C, ${weather.label}${weather.place ? ` in ${weather.place}` : ""} – gefühlt ${weather.feels} °C, Regen ${weather.rainProb} %.`
                  : "Kein Live-Wetter verfügbar – es wird die aktuelle Jahreszeit verwendet."
                : modeInfo.hint}
              {anyLocked && " Gesperrte Teile bleiben erhalten."}
            </p>
            {mode === "style" && (
              <ChipRow label="Stil" className="mt-3">
                {STYLES.map((s) => (
                  <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? null : s)}>
                    {s}
                  </Chip>
                ))}
              </ChipRow>
            )}
            {mode === "occasion" && (
              <ChipRow label="Anlass" className="mt-3">
                {OCCASIONS.map((o) => (
                  <Chip key={o.id} active={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? null : o.id)}>
                    {o.id}
                  </Chip>
                ))}
              </ChipRow>
            )}
            {canDress && canSeparates && (
              <div className="mt-4 flex gap-2" role="group" aria-label="Outfit-Typ">
                <Chip active={!dressMode} onClick={() => dressMode && switchBase(false)}>
                  Oberteil + Unterteil
                </Chip>
                <Chip active={dressMode} onClick={() => !dressMode && switchBase(true)}>
                  Kleid / Set
                </Chip>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => generate(mode, lockedSelection())} className="flex-1 sm:flex-none">
              <Shuffle className="size-4" aria-hidden /> Neu generieren
            </Button>
            <Button variant="outline" onClick={() => setSaving(true)} disabled={!chosenList.length} className="flex-1 sm:flex-none">
              <Bookmark className="size-4" aria-hidden /> {editing ? "Änderungen speichern" : "Save Outfit"}
            </Button>
            {mode !== "surprise" && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMode("surprise");
                  generate("surprise", lockedSelection());
                }}
                className="w-full sm:w-auto"
              >
                <Sparkles className="size-4" aria-hidden /> Surprise me
              </Button>
            )}
          </div>
        </div>
      </div>

      <Sheet open={!!picker} onClose={() => setPicker(null)} title={picker ? `${SLOT_LABEL[picker]} wählen` : ""} wide>
        {picker && (
          <ul className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-4">
            {candidatesFor(items, picker).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={sel[picker] === item.id}
                  onClick={() => {
                    // a dress replaces top + bottom and the other way round
                    setSel((s) => {
                      const next = { ...s, [picker]: item.id };
                      if (picker === "dress") {
                        delete next.top;
                        delete next.bottom;
                      } else if (picker === "top" || picker === "bottom") delete next.dress;
                      return next;
                    });
                    setActive(picker);
                    setPicker(null);
                  }}
                  className="block w-full text-left"
                >
                  <div className={cx("aspect-[3/4] overflow-hidden rounded-xl bg-tile p-2 transition", sel[picker] === item.id ? "ring-[1.5px] ring-ink" : "hover:shadow-md")}>
                    <ItemImage item={item} className="size-full" />
                  </div>
                  <p className="mt-1.5 truncate text-xs">{item.name}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {saving && (
        <SaveOutfitSheet
          key={editing?.id || "new"}
          items={chosen}
          outfit={editing}
          defaults={{
            ...describeOutfit(chosenList),
            styles: mode === "style" && style ? [style] : describeOutfit(chosenList).styles,
            occasion: mode === "occasion" ? occasion : null,
            note: explanation,
            weather: mode !== "random" ? weather : null,
          }}
          onClose={() => setSaving(false)}
          onSaved={() => editing && router.push("/boards")}
        />
      )}
    </>
  );
}
