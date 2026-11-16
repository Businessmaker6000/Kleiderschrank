"use client";

import { Heart, LayoutGrid, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { mutate } from "swr";
import { PageHeader } from "@/components/AppShell";
import { Collage, resolveItems } from "@/components/Collage";
import { OutfitDetail } from "@/components/OutfitDetail";
import { Button, Chip, ChipRow, ConfirmSheet, EmptyState, ErrorText, Input, Sheet, Skeleton, cx, useToast } from "@/components/ui";
import { api, useBoards, useItems, useOutfits } from "@/lib/client/api";
import { STYLES } from "@/lib/taxonomy";
import type { Board } from "@/lib/types";

// three canvas proportions give the grid its masonry rhythm; chosen per outfit, stable across reloads
const ASPECTS = ["4 / 5", "3 / 4", "5 / 6"];
const aspectFor = (id: string) => ASPECTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % ASPECTS.length];

export default function BoardsPage() {
  const { outfits, isLoading } = useOutfits();
  const { items } = useItems();
  const { boards } = useBoards();
  const toast = useToast();
  const [view, setView] = useState<string>("all"); // "all" | "favorites" | board id
  const [style, setStyle] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Board | null>(null);

  const usedStyles = useMemo(() => STYLES.filter((s) => outfits?.some((o) => o.styles.includes(s))), [outfits]);
  const visible = useMemo(
    () =>
      (outfits || []).filter((o) => {
        if (view === "favorites" && !o.favorite) return false;
        if (view !== "all" && view !== "favorites" && !o.board_ids.includes(view)) return false;
        if (style && !o.styles.includes(style)) return false;
        return true;
      }),
    [outfits, view, style],
  );
  const open = outfits?.find((o) => o.id === openId) || null;
  const currentBoard = boards?.find((b) => b.id === view) || null;

  async function createBoard() {
    setBusy(true);
    setError("");
    try {
      const { board } = await api<{ board: Board }>("/api/boards", { body: { name } });
      await mutate("/api/boards");
      setView(board.id);
      setName("");
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBoard() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/api/boards/${removing.id}`, { method: "DELETE" });
      await Promise.all([mutate("/api/boards"), mutate("/api/outfits")]);
      setView("all");
      toast("Kollektion gelöscht");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  const loading = isLoading || !items;

  return (
    <>
      <PageHeader
        eyebrow={outfits ? `${outfits.length} ${outfits.length === 1 ? "Outfit" : "Outfits"}` : "Vision Board"}
        title="Boards"
        action={
          currentBoard && (
            <Button variant="ghost" size="sm" onClick={() => setRemoving(currentBoard)} aria-label={`Kollektion ${currentBoard.name} löschen`}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )
        }
      />

      {loading && (
        <div className="columns-2 gap-3 md:columns-3 md:gap-5 lg:columns-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className={cx("mb-3 md:mb-5", i % 2 ? "aspect-[3/4]" : "aspect-[4/5]")} />
          ))}
        </div>
      )}

      {!loading && outfits && outfits.length === 0 && (
        <EmptyState
          icon={<LayoutGrid className="size-6" strokeWidth={1.4} />}
          title="Dein Vision Board"
          text="Speichere Outfits, die dir gefallen. Sie erscheinen hier als Collagen – sortiert nach deinen Kollektionen."
          action={
            <Link href="/create">
              <Button>Erstes Outfit erstellen</Button>
            </Link>
          }
        />
      )}

      {!loading && outfits && outfits.length > 0 && (
        <>
          <ChipRow label="Kollektionen" className="mb-3">
            <Chip active={view === "all"} onClick={() => setView("all")}>
              Alle
            </Chip>
            <Chip active={view === "favorites"} onClick={() => setView("favorites")}>
              <Heart className="size-3.5" aria-hidden /> Favorites
            </Chip>
            {(boards || []).map((b) => (
              <Chip key={b.id} active={view === b.id} onClick={() => setView(b.id)}>
                {b.name}
              </Chip>
            ))}
            <Chip onClick={() => setCreating(true)} className="border-dashed text-muted">
              <Plus className="size-3.5" aria-hidden /> Kollektion
            </Chip>
          </ChipRow>

          {usedStyles.length > 0 && (
            <ChipRow label="Stil" className="mb-5">
              {usedStyles.map((s) => (
                <Chip key={s} active={style === s} onClick={() => setStyle(style === s ? null : s)} className="h-8 text-xs">
                  {s}
                </Chip>
              ))}
            </ChipRow>
          )}

          {visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-2xl">{currentBoard ? "Noch leer" : "Nichts gefunden"}</p>
              <p className="mt-2 text-sm text-muted">
                {currentBoard
                  ? "Öffne ein Outfit, wähle „Bearbeiten“ und füge es dieser Kollektion hinzu."
                  : "Zu dieser Auswahl gibt es noch kein gespeichertes Outfit."}
              </p>
            </div>
          ) : (
            <ul className="columns-2 gap-3 md:columns-3 md:gap-5 lg:columns-4">
              {visible.map((o, i) => (
                <motion.li
                  key={o.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}
                  className="mb-4 break-inside-avoid md:mb-6"
                >
                  <button type="button" onClick={() => setOpenId(o.id)} className="group block w-full text-left">
                    <div className="relative transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-ink/5">
                      <Collage items={resolveItems(o.items, items!)} aspect={aspectFor(o.id)} className="rounded-2xl" />
                      {o.favorite && (
                        <span className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-full bg-surface/90">
                          <Heart className="size-3.5 fill-accent text-accent" aria-label="Favorit" />
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 truncate text-sm">{o.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{[...o.styles, o.occasion, o.season].filter(Boolean).join(" · ") || "Outfit"}</p>
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </>
      )}

      {open && items && <OutfitDetail outfit={open} items={items} onClose={() => setOpenId(null)} />}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Neue Kollektion"
        footer={
          <Button className="w-full" onClick={createBoard} loading={busy} disabled={!name.trim()}>
            Anlegen
          </Button>
        }
      >
        <div className="space-y-4 pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && void createBoard()}
            placeholder="z. B. Summer Fits, Date Night, Work"
            aria-label="Name der Kollektion"
            maxLength={40}
          />
          <div className="flex flex-wrap gap-2">
            {["Summer Fits", "Winter", "Old Money", "Streetwear", "Date Night", "Work"]
              .filter((s) => !boards?.some((b) => b.name === s))
              .map((s) => (
                <Chip key={s} onClick={() => setName(s)} active={name === s}>
                  {s}
                </Chip>
              ))}
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={removeBoard}
        loading={busy}
        title="Kollektion löschen?"
        text={`„${removing?.name}“ wird gelöscht. Die Outfits darin bleiben in deinem Board erhalten.`}
        confirmLabel="Löschen"
      />
    </>
  );
}
