"use client";

import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { collageLayout } from "@/lib/outfit/layout";
import { SLOTS, SLOT_LABEL } from "@/lib/taxonomy";
import type { Slot } from "@/lib/taxonomy";
import type { Item } from "@/lib/types";
import { imageUrl } from "@/lib/types";
import { cx } from "./ui";

export type CollageItems = Partial<Record<Slot, Item>>;

export interface CollageEdit {
  /** empty slots that should be offered as "add" placeholders */
  placeholders: Slot[];
  active: Slot | null;
  locked: Partial<Record<Slot, boolean>>;
  /** how many pieces the wardrobe has per slot (arrows only show when there is a choice) */
  counts: Partial<Record<Slot, number>>;
  onActivate: (slot: Slot) => void;
  onCycle: (slot: Slot, dir: 1 | -1) => void;
  onAdd: (slot: Slot) => void;
}

/** A piece on the neutral tile. `multiply` lets photos on light backgrounds melt into it. */
export function ItemImage({ item, className, eager }: { item: Item; className?: string; eager?: boolean }) {
  const src = imageUrl(item);
  if (!src) return <div className={cx("flex items-center justify-center text-xs text-muted", className)}>{item.name}</div>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- private, auth-protected image route
    <img
      src={src}
      alt={item.name}
      width={item.image!.width}
      height={item.image!.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cx("object-contain mix-blend-multiply select-none", className)}
    />
  );
}

/**
 * The outfit flat-lay. Used read-only (Today, Boards) and interactive (Create).
 * Each slot has a fixed, non-overlapping box from the layout template.
 */
export function Collage({
  items,
  edit,
  className,
  aspect = "4 / 5",
  eager,
}: {
  items: CollageItems;
  edit?: CollageEdit;
  className?: string;
  aspect?: string;
  eager?: boolean;
}) {
  const present = SLOTS.filter((s) => items[s]);
  const shown = SLOTS.filter((s) => items[s] || edit?.placeholders.includes(s));
  const boxes = collageLayout(shown);

  return (
    <div
      className={cx("relative w-full overflow-hidden rounded-3xl bg-tile", className)}
      style={{ aspectRatio: aspect }}
      role={edit ? "group" : "img"}
      aria-label={edit ? "Outfit-Collage" : `Outfit: ${present.map((s) => items[s]!.name).join(", ")}`}
    >
      {shown.map((slot) => {
        const box = boxes[slot];
        if (!box) return null;
        const item = items[slot];
        const style = { left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` };

        if (!item) {
          return (
            <button
              key={slot}
              type="button"
              style={style}
              onClick={() => edit!.onAdd(slot)}
              className="absolute flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/20 p-1 text-muted transition hover:border-ink/50 hover:text-ink"
            >
              <Plus className="size-4" aria-hidden />
              <span className="text-[10px] uppercase tracking-[0.14em]">{SLOT_LABEL[slot]}</span>
            </button>
          );
        }

        const active = edit?.active === slot;
        const canCycle = !!edit && (edit.counts[slot] || 0) > 1;
        return (
          <div key={slot} style={style} className="absolute">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute inset-0 p-[4%]"
              >
                <ItemImage item={item} eager={eager} className="size-full" />
              </motion.div>
            </AnimatePresence>

            {edit && (
              <>
                <button
                  type="button"
                  onClick={() => edit.onActivate(slot)}
                  aria-label={`${SLOT_LABEL[slot]}: ${item.name} auswählen`}
                  aria-pressed={active}
                  className={cx(
                    "absolute inset-0 rounded-2xl transition",
                    active ? "ring-[1.5px] ring-ink/70 ring-inset" : "hover:ring-1 hover:ring-ink/15 hover:ring-inset",
                  )}
                />
                {edit.locked[slot] && (
                  <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-ink">
                    <Lock className="size-3" aria-label="gesperrt" />
                  </span>
                )}
                {canCycle && !edit.locked[slot] && (
                  <>
                    <ArrowButton dir={-1} label={`Vorheriges ${SLOT_LABEL[slot]}`} onClick={() => edit.onCycle(slot, -1)} />
                    <ArrowButton dir={1} label={`Nächstes ${SLOT_LABEL[slot]}`} onClick={() => edit.onCycle(slot, 1)} />
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArrowButton({ dir, label, onClick }: { dir: 1 | -1; label: string; onClick: () => void }) {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // the visible disc is small and quiet; the padding makes the touch target comfortable
      className={cx("group absolute top-1/2 z-10 -translate-y-1/2 p-1.5", dir === 1 ? "right-0 translate-x-1" : "left-0 -translate-x-1")}
    >
      <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface/90 text-ink shadow-sm backdrop-blur transition group-hover:bg-surface group-active:scale-90">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
    </button>
  );
}

/** Resolves an outfit's slot → item-id mapping against the loaded wardrobe. */
export function resolveItems(entries: { slot: Slot; item_id: string }[] | Partial<Record<Slot, string>>, items: Item[]): CollageItems {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: CollageItems = {};
  const list = Array.isArray(entries) ? entries : Object.entries(entries).map(([slot, item_id]) => ({ slot: slot as Slot, item_id: item_id as string }));
  for (const e of list) {
    const item = byId.get(e.item_id);
    if (item) out[e.slot] = item;
  }
  return out;
}
