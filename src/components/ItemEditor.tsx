"use client";

import { Heart, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { api } from "@/lib/client/api";
import type { Item } from "@/lib/types";
import { ItemImage } from "./Collage";
import { ItemForm, draftFromItem, draftValid } from "./ItemForm";
import type { ItemDraft } from "./ItemForm";
import { Button, ConfirmSheet, ErrorText, Sheet, cx, useToast } from "./ui";

/** Detail + edit view of one piece. Mounted with `key={item.id}` so state resets per piece. */
export function ItemEditor({ item, onClose }: { item: Item; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<ItemDraft>(() => draftFromItem(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/items/${item.id}`, { method: "PATCH", body: draft });
      await Promise.all([mutate("/api/items"), mutate("/api/outfits")]);
      toast("Gespeichert");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      await Promise.all([mutate("/api/items"), mutate("/api/outfits")]);
      toast("Kleidungsstück gelöscht");
      setConfirm(false);
      onClose();
    } catch (e) {
      setConfirm(false);
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        wide
        title={item.name}
        footer={
          <div className="space-y-3">
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-3">
              <Button variant="danger" onClick={() => setConfirm(true)} aria-label="Kleidungsstück löschen" className="w-12 px-0">
                <Trash2 className="size-4" aria-hidden />
              </Button>
              <Button className="flex-1" onClick={save} loading={busy} disabled={!draftValid(draft)}>
                Speichern
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="md:sticky md:top-0 md:self-start">
            <div className="mx-auto aspect-[3/4] w-48 overflow-hidden rounded-2xl bg-tile p-3 md:w-full">
              <ItemImage item={item} eager className="size-full" />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, favorite: !d.favorite }))} aria-pressed={draft.favorite}>
                <Heart className={cx("size-4", draft.favorite && "fill-accent text-accent")} aria-hidden />
                {draft.favorite ? "Lieblingsstück" : "Als Favorit markieren"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push(`/create?around=${item.id}`)}>
                <Sparkles className="size-4" aria-hidden /> Outfit damit erstellen
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              {item.wear_count > 0 ? `${item.wear_count}× getragen · ` : ""}
              hinzugefügt am {new Date(item.created_at).toLocaleDateString("de-CH")}
            </p>
          </div>
          <ItemForm value={draft} onChange={setDraft} />
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        loading={deleting}
        title="Kleidungsstück löschen?"
        text={`„${item.name}“ wird samt Foto dauerhaft gelöscht und aus allen gespeicherten Outfits entfernt. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Löschen"
      />
    </>
  );
}
