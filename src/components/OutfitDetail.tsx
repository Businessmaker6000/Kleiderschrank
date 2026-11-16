"use client";

import { CalendarCheck, Copy, Heart, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { api, useBoards } from "@/lib/client/api";
import { SLOTS, SLOT_LABEL } from "@/lib/taxonomy";
import type { Item, Outfit } from "@/lib/types";
import { Collage, ItemImage, resolveItems } from "./Collage";
import { SaveOutfitSheet } from "./SaveOutfitSheet";
import { Button, ConfirmSheet, Sheet, cx, useToast } from "./ui";

/** Large view of a saved outfit with all its pieces and actions. */
export function OutfitDetail({ outfit, items, onClose }: { outfit: Outfit; items: Item[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { boards } = useBoards();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const chosen = resolveItems(outfit.items, items);
  const pieces = SLOTS.filter((s) => chosen[s]).map((s) => ({ slot: s, item: chosen[s]! }));
  const collections = (boards || []).filter((b) => outfit.board_ids.includes(b.id));
  const facts = [...outfit.styles, outfit.season, outfit.occasion].filter(Boolean) as string[];

  async function run(name: string, action: () => Promise<unknown>, done?: string, close?: boolean) {
    setBusy(name);
    try {
      await action();
      await Promise.all([mutate("/api/outfits"), name === "wear" ? mutate("/api/items") : null]);
      if (done) toast(done);
      if (close) onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Sheet open onClose={onClose} title={outfit.name} wide>
        <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-2 md:gap-8">
          <Collage items={chosen} eager />
          <div className="space-y-6">
            <div>
              {facts.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {facts.map((f) => (
                    <li key={f} className="rounded-full bg-chip px-3 py-1.5 text-xs">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              {outfit.note && <p className="mt-4 font-display text-xl leading-snug">{outfit.note}</p>}
              <dl className="mt-4 space-y-1 text-xs text-muted">
                <div className="flex gap-1.5">
                  <dt>Gespeichert am</dt>
                  <dd>{new Date(outfit.created_at).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })}</dd>
                </div>
                {outfit.weather && (
                  <div className="flex gap-1.5">
                    <dt>Wetter beim Speichern:</dt>
                    <dd>
                      {outfit.weather.temp} °C, {outfit.weather.label}
                    </dd>
                  </div>
                )}
                {collections.length > 0 && (
                  <div className="flex gap-1.5">
                    <dt>Kollektionen:</dt>
                    <dd>{collections.map((c) => c.name).join(", ")}</dd>
                  </div>
                )}
                {outfit.worn_count > 0 && (
                  <div className="flex gap-1.5">
                    <dt>Getragen:</dt>
                    <dd>{outfit.worn_count}×</dd>
                  </div>
                )}
              </dl>
            </div>

            <div>
              <p className="eyebrow mb-2.5">Kleidungsstücke</p>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {pieces.map(({ slot, item }) => (
                  <li key={item.id} className="flex items-center gap-3 p-2.5">
                    <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-tile p-1">
                      <ItemImage item={item} className="size-full" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{item.name}</p>
                      <p className="truncate text-xs text-muted">
                        {SLOT_LABEL[slot]} · {item.type}
                        {item.colors[0] ? ` · ${item.colors[0]}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Button className="col-span-2" onClick={() => router.push(`/create?outfit=${outfit.id}`)}>
                <Sparkles className="size-4" aria-hidden /> Im Builder öffnen
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={outfit.favorite}
                loading={busy === "fav"}
                onClick={() => run("fav", () => api(`/api/outfits/${outfit.id}`, { method: "PATCH", body: { favorite: !outfit.favorite } }))}
              >
                <Heart className={cx("size-4", outfit.favorite && "fill-accent text-accent")} aria-hidden /> {outfit.favorite ? "Favorit" : "Favorisieren"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden /> Bearbeiten
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={busy === "dup"}
                onClick={() => run("dup", () => api(`/api/outfits/${outfit.id}/duplicate`, { method: "POST" }), "Outfit dupliziert", true)}
              >
                <Copy className="size-4" aria-hidden /> Duplizieren
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={busy === "wear"}
                onClick={() => run("wear", () => api(`/api/outfits/${outfit.id}/wear`, { method: "POST" }), "Als heute getragen vermerkt")}
              >
                <CalendarCheck className="size-4" aria-hidden /> Heute getragen
              </Button>
              <Button variant="danger" size="sm" className="col-span-2" onClick={() => setConfirm(true)}>
                <Trash2 className="size-4" aria-hidden /> Outfit löschen
              </Button>
            </div>
          </div>
        </div>
      </Sheet>

      {editing && <SaveOutfitSheet key={outfit.id} items={chosen} outfit={outfit} onClose={() => setEditing(false)} />}
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        loading={busy === "del"}
        onConfirm={() => run("del", () => api(`/api/outfits/${outfit.id}`, { method: "DELETE" }), "Outfit gelöscht", true)}
        title="Outfit löschen?"
        text={`„${outfit.name}“ wird aus deinem Board entfernt. Die Kleidungsstücke bleiben im Kleiderschrank.`}
        confirmLabel="Löschen"
      />
    </>
  );
}
