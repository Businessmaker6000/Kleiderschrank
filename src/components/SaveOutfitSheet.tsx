"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { api, useBoards } from "@/lib/client/api";
import { OCCASIONS, SEASONS, SLOTS, STYLES } from "@/lib/taxonomy";
import type { Board, Outfit, WeatherSnapshot } from "@/lib/types";
import { Collage } from "./Collage";
import type { CollageItems } from "./Collage";
import { Button, Chip, ErrorText, Field, Group, Input, Sheet, useToast } from "./ui";

export interface OutfitDefaults {
  name?: string;
  styles?: string[];
  season?: string | null;
  occasion?: string | null;
  note?: string | null;
  weather?: WeatherSnapshot | null;
}

/**
 * Save a new outfit or edit an existing one (`outfit` given).
 * Mount it only while open, with a `key`, so the form starts fresh each time.
 */
export function SaveOutfitSheet({
  items,
  outfit,
  defaults,
  onClose,
  onSaved,
}: {
  items: CollageItems;
  outfit?: Outfit | null;
  defaults?: OutfitDefaults;
  onClose: () => void;
  onSaved?: (outfit: Outfit) => void;
}) {
  const toast = useToast();
  const { boards } = useBoards();
  const src = outfit || defaults || {};
  const [name, setName] = useState(src.name || "");
  const [styles, setStyles] = useState<string[]>(src.styles || []);
  const [season, setSeason] = useState<string | null>(src.season ?? null);
  const [occasion, setOccasion] = useState<string | null>(src.occasion ?? null);
  const [boardIds, setBoardIds] = useState<string[]>(outfit?.board_ids || []);
  const [newBoard, setNewBoard] = useState("");
  const [addingBoard, setAddingBoard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fallbackName = `Outfit vom ${new Date().toLocaleDateString("de-CH", { day: "numeric", month: "long" })}`;

  async function createBoard() {
    const n = newBoard.trim();
    if (!n) return;
    setError("");
    try {
      const { board } = await api<{ board: Board }>("/api/boards", { body: { name: n } });
      await mutate("/api/boards");
      setBoardIds((ids) => [...ids, board.id]);
      setNewBoard("");
      setAddingBoard(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    const body = {
      name: name.trim() || (outfit ? outfit.name : fallbackName),
      styles,
      season,
      occasion,
      board_ids: boardIds,
      items: SLOTS.filter((s) => items[s]).map((s) => ({ slot: s, item_id: items[s]!.id })),
      ...(outfit ? {} : { note: defaults?.note ?? null, weather: defaults?.weather ?? null }),
    };
    try {
      const { outfit: saved } = outfit
        ? await api<{ outfit: Outfit }>(`/api/outfits/${outfit.id}`, { method: "PATCH", body })
        : await api<{ outfit: Outfit }>("/api/outfits", { body });
      await mutate("/api/outfits");
      toast(outfit ? "Outfit aktualisiert" : "Outfit im Board gespeichert");
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={outfit ? "Outfit bearbeiten" : "Outfit speichern"}
      footer={
        <div className="space-y-3">
          <ErrorText>{error}</ErrorText>
          <Button className="w-full" onClick={save} loading={busy}>
            {outfit ? "Änderungen speichern" : "Speichern"}
          </Button>
        </div>
      }
    >
      <div className="space-y-7 pt-2">
        <Collage items={items} className="mx-auto max-w-[11rem]" eager />
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={fallbackName} maxLength={60} />
        </Field>
        <Group label="Stil">
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <Chip key={s} active={styles.includes(s)} onClick={() => setStyles(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s].slice(-4))}>
                {s}
              </Chip>
            ))}
          </div>
        </Group>
        <Group label="Saison">
          <div className="flex flex-wrap gap-2">
            {SEASONS.map((s) => (
              <Chip key={s} active={season === s} onClick={() => setSeason(season === s ? null : s)}>
                {s}
              </Chip>
            ))}
          </div>
        </Group>
        <Group label="Anlass">
          <div className="flex flex-wrap gap-2">
            {OCCASIONS.map((o) => (
              <Chip key={o.id} active={occasion === o.id} onClick={() => setOccasion(occasion === o.id ? null : o.id)}>
                {o.id}
              </Chip>
            ))}
          </div>
        </Group>
        <Group label="Kollektionen">
          <div className="flex flex-wrap gap-2">
            {(boards || []).map((b) => (
              <Chip key={b.id} active={boardIds.includes(b.id)} onClick={() => setBoardIds(boardIds.includes(b.id) ? boardIds.filter((x) => x !== b.id) : [...boardIds, b.id])}>
                {b.name}
              </Chip>
            ))}
            {!addingBoard && (
              <Chip onClick={() => setAddingBoard(true)} className="border-dashed text-muted">
                <Plus className="size-3.5" aria-hidden /> Neue Kollektion
              </Chip>
            )}
          </div>
          {addingBoard && (
            <div className="mt-3 flex gap-2">
              <Input
                value={newBoard}
                onChange={(e) => setNewBoard(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void createBoard())}
                placeholder="z. B. Summer Fits"
                aria-label="Name der neuen Kollektion"
                maxLength={40}
                autoFocus
              />
              <Button variant="outline" onClick={createBoard} disabled={!newBoard.trim()}>
                Anlegen
              </Button>
            </div>
          )}
        </Group>
      </div>
    </Sheet>
  );
}
