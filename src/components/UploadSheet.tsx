"use client";

import { Camera, Images, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mutate } from "swr";
import { upload, useMe } from "@/lib/client/api";
import { prepareImage } from "@/lib/client/image";
import type { PreparedImage } from "@/lib/client/image";
import type { Item } from "@/lib/types";
import { ItemForm, draftValid, emptyDraft } from "./ItemForm";
import type { ItemDraft } from "./ItemForm";
import { Button, ErrorText, Sheet, useToast } from "./ui";

interface Entry {
  file: File;
  image: PreparedImage | null;
  draft: ItemDraft;
  error: string | null;
  /** progress of the background removal, 0…1 */
  progress: number;
  /** AI suggestion state for this photo */
  ai: "idle" | "running" | "done" | "none";
}

type Suggestion = Partial<Pick<ItemDraft, "name" | "group" | "type" | "colors" | "pattern" | "material" | "seasons" | "styles">>;

export function UploadSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMe();
  const toast = useToast();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
  const generation = useRef(0);

  const current = entries[index];

  function reset() {
    generation.current++;
    entries.forEach((e) => e.image && URL.revokeObjectURL(e.image.previewUrl));
    setEntries([]);
    setIndex(0);
    setProgress(null);
    setError("");
    setSaved(0);
  }

  function close() {
    if (progress !== null) return; // never drop an upload half-way
    reset();
    onClose();
  }

  const patch = (i: number, p: Partial<Entry> | ((e: Entry) => Partial<Entry>)) =>
    setEntries((list) => list.map((e, k) => (k === i ? { ...e, ...(typeof p === "function" ? p(e) : p) } : e)));

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const gen = generation.current;
    const base = entries.length;
    const list = Array.from(files).slice(0, 20);
    setEntries((prev) => [...prev, ...list.map((file) => ({ file, image: null, draft: emptyDraft(), error: null, progress: 0, ai: "idle" as const }))]);
    // photos are prepared one after the other to keep memory low on phones
    for (let k = 0; k < list.length; k++) {
      try {
        const image = await prepareImage(list[k], { onProgress: (p) => generation.current === gen && patch(base + k, { progress: p }) });
        if (generation.current !== gen) return URL.revokeObjectURL(image.previewUrl);
        patch(base + k, (e) => ({ image, draft: { ...e.draft, colors: e.draft.colors.length || !image.color ? e.draft.colors : [image.color] } }));
      } catch (err) {
        if (generation.current !== gen) return;
        patch(base + k, { error: (err as Error).message });
      }
    }
  }

  // optional AI tagging, one photo at a time, only for the photo that is being edited
  useEffect(() => {
    if (!me?.aiAvailable || !current?.image || current.ai !== "idle") return;
    const i = index;
    const gen = generation.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the request as started
    patch(i, { ai: "running" });
    const form = new FormData();
    form.append("image", current.image.blob);
    fetch("/api/analyze", { method: "POST", body: form, credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { suggestion: null }))
      .then(({ suggestion }: { suggestion: Suggestion | null }) => {
        if (generation.current !== gen) return;
        if (!suggestion) return patch(i, { ai: "none" });
        // suggestions fill gaps only — anything the user already chose stays
        patch(i, (e) => ({
          ai: "done",
          draft: {
            ...e.draft,
            ...(e.draft.group ? {} : { group: suggestion.group ?? null, type: suggestion.type ?? "" }),
            name: e.draft.name || suggestion.name || "",
            colors: suggestion.colors?.length ? suggestion.colors : e.draft.colors,
            pattern: e.draft.pattern ?? suggestion.pattern ?? null,
            material: e.draft.material ?? suggestion.material ?? null,
            seasons: e.draft.seasons.length ? e.draft.seasons : suggestion.seasons || [],
            styles: e.draft.styles.length ? e.draft.styles : suggestion.styles || [],
          },
        }));
      })
      .catch(() => generation.current === gen && patch(i, { ai: "none" }));
  }, [me?.aiAvailable, index, current?.image, current?.ai]);

  function next(count = saved) {
    setError("");
    if (index + 1 < entries.length) return setIndex(index + 1);
    if (count > 0) toast(count === 1 ? "Kleidungsstück gespeichert" : `${count} Kleidungsstücke gespeichert`);
    reset();
    onClose();
  }

  async function save() {
    if (!current?.image || !draftValid(current.draft)) return;
    setError("");
    setProgress(0);
    try {
      const form = new FormData();
      form.append("image", current.image.blob, "photo");
      form.append("width", String(current.image.width));
      form.append("height", String(current.image.height));
      if (current.image.cutout) form.append("cutout", "1");
      form.append("meta", JSON.stringify(current.draft));
      const { item } = await upload<{ item: Item }>("/api/items", form, setProgress);
      // show the new piece immediately, then confirm with the server
      await mutate("/api/items", (data?: { items: Item[] }) => ({ items: [item, ...(data?.items || [])] }), { revalidate: false });
      setSaved((s) => s + 1);
      setProgress(null);
      next(saved + 1);
    } catch (err) {
      setProgress(null);
      setError((err as Error).message);
    }
  }

  const picking = entries.length === 0;

  return (
    <Sheet
      open={open}
      onClose={close}
      wide={!picking}
      title={picking ? "Kleidung hinzufügen" : entries.length > 1 ? `Foto ${index + 1} von ${entries.length}` : "Neues Kleidungsstück"}
      footer={
        picking ? undefined : (
          <div className="space-y-3">
            <ErrorText>{error}</ErrorText>
            {progress !== null && (
              <div
                role="progressbar"
                aria-label="Upload"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-1 overflow-hidden rounded-full bg-chip"
              >
                <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => next()} disabled={progress !== null}>
                {current?.error ? "Weiter" : "Überspringen"}
              </Button>
              <Button className="flex-1" onClick={save} loading={progress !== null} disabled={!current?.image || !draftValid(current.draft)}>
                {progress !== null ? `Lädt hoch … ${Math.round(progress * 100)} %` : "Speichern"}
              </Button>
            </div>
          </div>
        )
      }
    >
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />

      {picking ? (
        <div className="space-y-3 pt-2">
          <p className="pb-2 text-sm leading-relaxed text-muted">
            Der Hintergrund wird automatisch entfernt, übrig bleibt nur das Kleidungsstück. Am besten gelingt das, wenn es flach liegt oder am Bügel hängt und sich klar vom Hintergrund abhebt.
          </p>
          <button
            type="button"
            onClick={() => camera.current?.click()}
            className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-ink/40 active:scale-[0.99]"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-chip">
              <Camera className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <span className="block font-medium">Foto aufnehmen</span>
              <span className="text-sm text-muted">Direkt mit der Kamera</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => gallery.current?.click()}
            className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-5 text-left transition hover:border-ink/40 active:scale-[0.99]"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-chip">
              <Images className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <span>
              <span className="block font-medium">Aus Galerie wählen</span>
              <span className="text-sm text-muted">Auch mehrere Bilder auf einmal</span>
            </span>
          </button>
        </div>
      ) : (
        current && (
          <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="md:sticky md:top-0 md:self-start">
              <div className="mx-auto flex aspect-[3/4] w-40 items-center justify-center overflow-hidden rounded-2xl bg-tile p-3 md:w-full">
                {current.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview blob
                  <img
                    src={current.image.previewUrl}
                    alt="Vorschau des Fotos"
                    className={current.image.cutout ? "size-full object-contain drop-shadow-[0_5px_7px_rgb(0_0_0/0.16)]" : "size-full object-contain mix-blend-multiply"}
                  />
                ) : current.error ? (
                  <p className="px-2 text-center text-xs text-danger">{current.error}</p>
                ) : (
                  <div className="skeleton flex size-full items-end justify-center rounded-xl p-3" role="status">
                    <span className="rounded-full bg-surface/90 px-3 py-1.5 text-center text-[11px] leading-tight text-ink">
                      Hintergrund wird entfernt{current.progress > 0 ? ` … ${Math.round(current.progress * 100)} %` : " …"}
                    </span>
                  </div>
                )}
              </div>
              {current.image && !current.image.cutout && (
                <p className="mt-3 text-center text-xs leading-relaxed text-muted">
                  Der Hintergrund liess sich nicht entfernen – das Foto wird unverändert gespeichert.
                </p>
              )}
              {current.ai === "running" && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted" role="status">
                  <Sparkles className="size-3.5 animate-pulse" aria-hidden /> Kleidungsstück wird erkannt …
                </p>
              )}
              {current.ai === "done" && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
                  <Sparkles className="size-3.5" aria-hidden /> Vorschläge eingetragen – bitte prüfen
                </p>
              )}
            </div>
            {!current.error && <ItemForm value={current.draft} onChange={(draft) => patch(index, { draft })} />}
          </div>
        )
      )}
    </Sheet>
  );
}
