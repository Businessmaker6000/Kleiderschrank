"use client";

import { Eraser, Heart, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate } from "swr";
import { api, upload, useMe } from "@/lib/client/api";
import { prepareImage } from "@/lib/client/image";
import type { Item } from "@/lib/types";
import { imageUrl } from "@/lib/types";
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
  const [cutting, setCutting] = useState<number | null>(null);
  const [studioBusy, setStudioBusy] = useState(false);
  const { data: me } = useMe();

  // older uploads: remove the background now and replace the stored photo
  async function cutOut(studio = false) {
    if (studio) setStudioBusy(true);
    else setCutting(0);
    setError("");
    try {
      const res = await fetch(imageUrl(item)!, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Das Foto konnte nicht geladen werden.");
      const prepared = await prepareImage(await res.blob(), { studio, onProgress: studio ? undefined : setCutting });
      URL.revokeObjectURL(prepared.previewUrl);
      if (studio && !prepared.studio) throw new Error(prepared.note || "Das Studiobild konnte nicht erzeugt werden.");
      if (!prepared.cutout) throw new Error("Der Hintergrund liess sich bei diesem Foto nicht entfernen.");
      const form = new FormData();
      form.append("image", prepared.blob, "photo");
      form.append("width", String(prepared.width));
      form.append("height", String(prepared.height));
      form.append("cutout", "1");
      await upload(`/api/items/${item.id}/image`, form, () => {});
      await mutate("/api/items");
      toast(studio ? "Studiobild gespeichert" : "Hintergrund entfernt");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCutting(null);
      setStudioBusy(false);
    }
  }

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
              <Button variant="danger" onClick={() => setConfirm(true)} className="px-5">
                <Trash2 className="size-4" aria-hidden /> Löschen
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
              {item.image && !item.image.cutout && (
                <Button variant="outline" size="sm" onClick={() => cutOut(false)} loading={cutting !== null} disabled={studioBusy}>
                  {cutting === null && <Eraser className="size-4" aria-hidden />}
                  {cutting === null ? "Hintergrund entfernen" : `Wird entfernt … ${Math.round(cutting * 100)} %`}
                </Button>
              )}
              {item.image && me?.studioAvailable && (
                <Button variant="outline" size="sm" onClick={() => cutOut(true)} loading={studioBusy} disabled={cutting !== null}>
                  {!studioBusy && <Wand2 className="size-4" aria-hidden />}
                  {studioBusy ? "Studiobild wird erzeugt …" : "Studiobild erzeugen"}
                </Button>
              )}
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
