"use client";

import { Check, Heart, Plus, Search, Shirt, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { mutate } from "swr";
import { PageHeader } from "@/components/AppShell";
import { ItemImage } from "@/components/Collage";
import { ItemEditor } from "@/components/ItemEditor";
import { ColorDot } from "@/components/ItemForm";
import { UploadSheet } from "@/components/UploadSheet";
import { Button, Chip, ChipRow, ConfirmSheet, EmptyState, Group, Sheet, Skeleton, cx, inputClass, useToast } from "@/components/ui";
import { api, useItems } from "@/lib/client/api";
import { COLORS, GROUPS, GROUP_LABEL, SEASONS, STYLES } from "@/lib/taxonomy";
import type { Group as GroupId } from "@/lib/taxonomy";
import type { Item } from "@/lib/types";

const SORTS = {
  newest: "Neueste zuerst",
  oldest: "Älteste zuerst",
  name: "Name A–Z",
  worn: "Am häufigsten getragen",
  favorites: "Favoriten zuerst",
} as const;
type Sort = keyof typeof SORTS;

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function WardrobePage() {
  const { items, error, isLoading } = useItems();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupId | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [onlyFav, setOnlyFav] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  // selection mode: tick several pieces, then delete them in one go
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function stopSelecting() {
    setSelecting(false);
    setSelected([]);
  }

  async function deleteSelected() {
    setDeleting(true);
    let done = 0;
    let failure = "";
    for (const id of selected) {
      try {
        await api(`/api/items/${id}`, { method: "DELETE" });
        done++;
      } catch (e) {
        failure = (e as Error).message;
      }
    }
    await Promise.all([mutate("/api/items"), mutate("/api/outfits")]);
    setDeleting(false);
    setConfirmDelete(false);
    stopSelecting();
    if (failure) toast(done ? `${done} gelöscht, bei den übrigen: ${failure}` : failure, "error");
    else toast(done === 1 ? "Kleidungsstück gelöscht" : `${done} Kleidungsstücke gelöscht`);
  }

  // filters combine: every active filter group must match (within a group, any value matches)
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items || []).filter((i) => {
      if (group && i.group !== group) return false;
      if (onlyFav && !i.favorite) return false;
      if (colors.length && !colors.some((c) => i.colors.includes(c))) return false;
      if (styles.length && !styles.every((s) => i.styles.includes(s))) return false;
      if (seasons.length && i.seasons.length && !seasons.some((s) => i.seasons.includes(s))) return false;
      if (q) {
        const hay = [i.name, i.type, GROUP_LABEL[i.group], i.material, i.pattern, ...i.colors, ...i.styles, ...i.tags].join(" ").toLowerCase();
        if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: Item, b: Item) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.name.localeCompare(b.name, "de"),
      worn: (a, b) => b.wear_count - a.wear_count || b.created_at.localeCompare(a.created_at),
      favorites: (a, b) => Number(b.favorite) - Number(a.favorite) || b.created_at.localeCompare(a.created_at),
    };
    return list.sort(by[sort]);
  }, [items, query, group, colors, styles, seasons, onlyFav, sort]);

  const detailCount = colors.length + styles.length + seasons.length + (onlyFav ? 1 : 0);
  const anyFilter = detailCount > 0 || !!group || !!query.trim();
  const clear = () => {
    setQuery("");
    setGroup(null);
    setColors([]);
    setStyles([]);
    setSeasons([]);
    setOnlyFav(false);
  };

  async function toggleFavorite(item: Item) {
    const favorite = !item.favorite;
    // optimistic: the heart reacts instantly and rolls back if the server refuses
    const optimistic = (data?: { items: Item[] }) => ({ items: (data?.items || []).map((i) => (i.id === item.id ? { ...i, favorite } : i)) });
    try {
      await mutate("/api/items", api(`/api/items/${item.id}`, { method: "PATCH", body: { favorite } }).then(() => optimistic({ items: items || [] })), {
        optimisticData: optimistic,
        rollbackOnError: true,
        revalidate: false,
      });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const usedGroups = GROUPS.filter((g) => items?.some((i) => i.group === g.id));

  return (
    <>
      <PageHeader
        eyebrow={items ? `${items.length} ${items.length === 1 ? "Teil" : "Teile"}` : "Kleiderschrank"}
        title="Wardrobe"
        action={
          selecting ? (
            <Button size="sm" variant="outline" onClick={stopSelecting}>
              Fertig
            </Button>
          ) : (
            <div className="flex gap-2">
              {!!items?.length && (
                <Button size="sm" variant="outline" onClick={() => setSelecting(true)}>
                  Auswählen
                </Button>
              )}
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Plus className="size-4" aria-hidden /> Hinzufügen
              </Button>
            </div>
          )
        }
      />

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      )}

      {error && !items && (
        <EmptyState
          icon={<Shirt className="size-6" strokeWidth={1.4} />}
          title="Nicht erreichbar"
          text="Dein Kleiderschrank konnte gerade nicht geladen werden."
          action={<Button onClick={() => mutate("/api/items")}>Erneut versuchen</Button>}
        />
      )}

      {items && items.length === 0 && (
        <EmptyState
          icon={<Shirt className="size-6" strokeWidth={1.4} />}
          title="Noch ganz leer"
          text="Fotografiere deine ersten Kleidungsstücke. Schon mit einem Oberteil, einer Hose und einem Paar Schuhe entstehen die ersten Outfits."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" aria-hidden /> Erstes Teil hinzufügen
            </Button>
          }
        />
      )}

      {items && items.length > 0 && (
        <>
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen"
                aria-label="Kleiderschrank durchsuchen"
                className={cx(inputClass, "pl-11")}
              />
            </div>
            <Button variant="outline" onClick={() => setFilterOpen(true)} className="relative px-4" aria-label={`Filter und Sortierung${detailCount ? `, ${detailCount} aktiv` : ""}`}>
              <SlidersHorizontal className="size-4" aria-hidden />
              <span className="hidden sm:inline">Filter</span>
              {detailCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-ink">{detailCount}</span>
              )}
            </Button>
          </div>

          <ChipRow label="Kategorie" className="mb-3">
            <Chip active={!group} onClick={() => setGroup(null)}>
              Alle
            </Chip>
            {usedGroups.map((g) => (
              <Chip key={g.id} active={group === g.id} onClick={() => setGroup(group === g.id ? null : g.id)}>
                {g.label}
              </Chip>
            ))}
          </ChipRow>

          {detailCount > 0 && (
            <ChipRow label="Aktive Filter" className="mb-3">
              {onlyFav && (
                <Chip active onClick={() => setOnlyFav(false)}>
                  Favoriten <X className="size-3" aria-hidden />
                </Chip>
              )}
              {colors.map((c) => (
                <Chip key={c} active onClick={() => setColors(toggle(colors, c))}>
                  <ColorDot id={c} /> {c} <X className="size-3" aria-hidden />
                </Chip>
              ))}
              {styles.map((s) => (
                <Chip key={s} active onClick={() => setStyles(toggle(styles, s))}>
                  {s} <X className="size-3" aria-hidden />
                </Chip>
              ))}
              {seasons.map((s) => (
                <Chip key={s} active onClick={() => setSeasons(toggle(seasons, s))}>
                  {s} <X className="size-3" aria-hidden />
                </Chip>
              ))}
            </ChipRow>
          )}

          {visible.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-2xl">Nichts gefunden</p>
              <p className="mt-2 text-sm text-muted">Zu dieser Kombination passt kein Kleidungsstück.</p>
              <Button variant="outline" size="sm" className="mt-5" onClick={clear}>
                Filter zurücksetzen
              </Button>
            </div>
          ) : (
            <>
              {anyFilter && (
                <p className="mb-3 text-xs text-muted" role="status">
                  {visible.length} von {items.length}
                </p>
              )}
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:gap-x-5 md:gap-y-7 lg:grid-cols-4">
                {visible.map((item) => (
                  <li key={item.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => (selecting ? setSelected(toggle(selected, item.id)) : setEditing(item))}
                      aria-pressed={selecting ? selected.includes(item.id) : undefined}
                      aria-label={selecting ? `${item.name} ${selected.includes(item.id) ? "abwählen" : "auswählen"}` : undefined}
                      className="block w-full text-left"
                    >
                      <div
                        className={cx(
                          "aspect-[3/4] overflow-hidden rounded-2xl bg-tile p-3 transition group-hover:shadow-md",
                          selecting && selected.includes(item.id) && "ring-2 ring-ink ring-inset",
                        )}
                      >
                        <ItemImage item={item} className="size-full transition duration-300 group-hover:scale-[1.03]" />
                      </div>
                      <p className="mt-2.5 truncate text-sm">{item.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                        {item.colors[0] && <ColorDot id={item.colors[0]} className="size-2.5" />}
                        {item.type}
                      </p>
                    </button>
                    {selecting && (
                      <span
                        aria-hidden
                        className={cx(
                          "pointer-events-none absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full border transition",
                          selected.includes(item.id) ? "border-primary bg-primary text-primary-ink" : "border-ink/30 bg-surface/80",
                        )}
                      >
                        {selected.includes(item.id) && <Check className="size-3.5" strokeWidth={2.5} />}
                      </span>
                    )}
                    <button
                      type="button"
                      hidden={selecting}
                      onClick={() => toggleFavorite(item)}
                      aria-pressed={item.favorite}
                      aria-label={item.favorite ? `${item.name} aus Favoriten entfernen` : `${item.name} als Favorit markieren`}
                      className="absolute top-1 right-1 flex size-10 items-center justify-center rounded-full transition active:scale-90"
                    >
                      <Heart className={cx("size-[18px] transition", item.favorite ? "fill-accent text-accent" : "text-ink/35 hover:text-ink")} strokeWidth={1.6} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter & Sortierung"
        footer={
          <div className="flex gap-3">
            <Button variant="outline" onClick={clear} disabled={!anyFilter}>
              Zurücksetzen
            </Button>
            <Button className="flex-1" onClick={() => setFilterOpen(false)}>
              {visible.length} {visible.length === 1 ? "Teil" : "Teile"} anzeigen
            </Button>
          </div>
        }
      >
        <div className="space-y-7 pt-2">
          <Group label="Sortieren">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
                  {SORTS[s]}
                </Chip>
              ))}
            </div>
          </Group>
          <Group label="Favoriten">
            <Chip active={onlyFav} onClick={() => setOnlyFav(!onlyFav)}>
              <Heart className="size-3.5" aria-hidden /> Nur Lieblingsstücke
            </Chip>
          </Group>
          <Group label="Farbe">
            <div className="flex flex-wrap gap-2">
              {COLORS.filter((c) => items?.some((i) => i.colors.includes(c.id))).map((c) => (
                <Chip key={c.id} active={colors.includes(c.id)} onClick={() => setColors(toggle(colors, c.id))}>
                  <ColorDot id={c.id} /> {c.id}
                </Chip>
              ))}
              {!items?.some((i) => i.colors.length) && <p className="text-sm text-muted">Noch keine Farben vergeben.</p>}
            </div>
          </Group>
          <Group label="Stil">
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Chip key={s} active={styles.includes(s)} onClick={() => setStyles(toggle(styles, s))}>
                  {s}
                </Chip>
              ))}
            </div>
          </Group>
          <Group label="Saison">
            <div className="flex flex-wrap gap-2">
              {SEASONS.map((s) => (
                <Chip key={s} active={seasons.includes(s)} onClick={() => setSeasons(toggle(seasons, s))}>
                  {s}
                </Chip>
              ))}
            </div>
          </Group>
        </div>
      </Sheet>

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-5 pb-3 md:bottom-6">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-full border border-line bg-surface py-2 pr-2 pl-5 shadow-xl">
            <p className="flex-1 text-sm" role="status">
              {selected.length === 0 ? "Teile antippen" : `${selected.length} ausgewählt`}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setSelected(selected.length === visible.length ? [] : visible.map((i) => i.id))}>
              {selected.length === visible.length && visible.length > 0 ? "Keine" : "Alle"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={!selected.length}>
              <Trash2 className="size-4" aria-hidden /> Löschen
            </Button>
          </div>
        </div>
      )}
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteSelected}
        loading={deleting}
        title={selected.length === 1 ? "Kleidungsstück löschen?" : `${selected.length} Kleidungsstücke löschen?`}
        text="Die ausgewählten Teile werden samt Foto dauerhaft gelöscht und aus allen gespeicherten Outfits entfernt. Das lässt sich nicht rückgängig machen."
        confirmLabel="Löschen"
      />

      <UploadSheet open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {editing && <ItemEditor key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
