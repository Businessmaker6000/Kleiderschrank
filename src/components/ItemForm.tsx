"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import { api, useMe } from "@/lib/client/api";
import { COLORS, GROUPS, MATERIALS, PATTERNS, SEASONS, SLOTS, SLOT_LABEL, STYLES, defaultSlot } from "@/lib/taxonomy";
import type { Group as GroupId, Slot } from "@/lib/taxonomy";
import type { CustomCategory, Item } from "@/lib/types";
import { Button, Chip, Field, Group, Input, cx } from "./ui";

export interface ItemDraft {
  name: string;
  group: GroupId | null;
  type: string;
  slot: Slot;
  colors: string[];
  pattern: string | null;
  material: string | null;
  seasons: string[];
  styles: string[];
  tags: string[];
  favorite: boolean;
}

export const emptyDraft = (): ItemDraft => ({
  name: "",
  group: null,
  type: "",
  slot: "top",
  colors: [],
  pattern: null,
  material: null,
  seasons: [],
  styles: [],
  tags: [],
  favorite: false,
});

export const draftFromItem = (i: Item): ItemDraft => ({
  name: i.name,
  group: i.group,
  type: i.type,
  slot: i.slot,
  colors: i.colors,
  pattern: i.pattern,
  material: i.material,
  seasons: i.seasons,
  styles: i.styles,
  tags: i.tags,
  favorite: i.favorite,
});

export function draftValid(d: ItemDraft): boolean {
  return !!d.group && !!d.type;
}

function toggle(list: string[], value: string, max = 99): string[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  return list.length >= max ? [...list.slice(1), value] : [...list, value];
}

export function ColorDot({ id, className }: { id: string; className?: string }) {
  const c = COLORS.find((x) => x.id === id);
  return (
    <span
      aria-hidden
      className={cx("inline-block size-3.5 shrink-0 rounded-full border border-ink/15", className)}
      style={{
        background: id === "Mehrfarbig" ? "conic-gradient(#b5302c, #e6c64a, #3f7a4f, #3566b0, #7a5aa0, #b5302c)" : c?.hex,
      }}
    />
  );
}

export function ItemForm({ value, onChange }: { value: ItemDraft; onChange: (next: ItemDraft) => void }) {
  const { data: me } = useMe();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [tagText, setTagText] = useState("");
  const set = (patch: Partial<ItemDraft>) => onChange({ ...value, ...patch });

  const group = GROUPS.find((g) => g.id === value.group);
  const customTypes = (me?.categories || []).filter((c) => c.group === value.group).map((c) => c.name);
  const types = group ? [...group.types, ...customTypes.filter((t) => !group.types.includes(t))] : [];
  // a type that is no longer a known category (e.g. deleted custom one) stays selectable
  if (value.type && group && !types.includes(value.type)) types.push(value.type);

  async function addCustom() {
    const name = custom.trim();
    if (!name || !value.group) return;
    setBusy(true);
    try {
      const { category } = await api<{ category: CustomCategory }>("/api/categories", { body: { name, group: value.group } });
      await mutate("/api/me");
      set({ type: category.name });
      setCustom("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    const t = tagText.trim().replace(/^#/, "").slice(0, 24);
    if (t && !value.tags.includes(t)) set({ tags: [...value.tags, t].slice(0, 12) });
    setTagText("");
  }

  return (
    <div className="space-y-7">
      <Group label="Kategorie">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Chip
              key={g.id}
              active={value.group === g.id}
              onClick={() => set({ group: g.id, type: "", slot: g.id === "other" ? value.slot : defaultSlot(g.id, "") })}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </Group>

      {group && (
        <Group label="Art">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Chip key={t} active={value.type === t} onClick={() => set({ type: t, slot: group.id === "other" ? value.slot : defaultSlot(group.id, t) })}>
                {t}
              </Chip>
            ))}
            {!adding && (
              <Chip onClick={() => setAdding(true)} className="border-dashed text-muted">
                <Plus className="size-3.5" aria-hidden /> Eigene
              </Chip>
            )}
          </div>
          {adding && (
            <div className="mt-3 flex gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void addCustom())}
                placeholder="Eigene Kategorie"
                aria-label="Name der eigenen Kategorie"
                maxLength={40}
                autoFocus
              />
              <Button onClick={addCustom} loading={busy} disabled={!custom.trim()}>
                Hinzufügen
              </Button>
            </div>
          )}
        </Group>
      )}

      {value.group === "other" && (
        <Group label="Wird getragen als">
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <Chip key={s} active={value.slot === s} onClick={() => set({ slot: s })}>
                {SLOT_LABEL[s]}
              </Chip>
            ))}
          </div>
        </Group>
      )}

      <Field label="Name (optional)">
        <Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder={value.type || "z. B. Beiger Strickpullover"} maxLength={60} />
      </Field>

      <Group label="Farbe">
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <Chip key={c.id} active={value.colors.includes(c.id)} onClick={() => set({ colors: toggle(value.colors, c.id, 3) })}>
              <ColorDot id={c.id} /> {c.id}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label="Stil">
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <Chip key={s} active={value.styles.includes(s)} onClick={() => set({ styles: toggle(value.styles, s, 8) })}>
              {s}
            </Chip>
          ))}
        </div>
      </Group>

      <Group label="Saison">
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => (
            <Chip key={s} active={value.seasons.includes(s)} onClick={() => set({ seasons: toggle(value.seasons, s) })}>
              {s}
            </Chip>
          ))}
          <Chip active={value.seasons.length === 4} onClick={() => set({ seasons: value.seasons.length === 4 ? [] : [...SEASONS] })}>
            {value.seasons.length === 4 && <Check className="size-3.5" aria-hidden />} Ganzjährig
          </Chip>
        </div>
      </Group>

      <details className="group rounded-2xl border border-line bg-surface px-4 open:pb-5">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-sm">
          Muster, Material & Tags
          <Plus className="size-4 text-muted transition group-open:rotate-45" aria-hidden />
        </summary>
        <div className="space-y-6 pt-2">
          <Group label="Muster">
            <div className="flex flex-wrap gap-2">
              {PATTERNS.map((p) => (
                <Chip key={p} active={value.pattern === p} onClick={() => set({ pattern: value.pattern === p ? null : p })}>
                  {p}
                </Chip>
              ))}
            </div>
          </Group>
          <Group label="Material">
            <div className="flex flex-wrap gap-2">
              {MATERIALS.map((m) => (
                <Chip key={m} active={value.material === m} onClick={() => set({ material: value.material === m ? null : m })}>
                  {m}
                </Chip>
              ))}
            </div>
          </Group>
          <Group label="Tags">
            {value.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {value.tags.map((t) => (
                  <Chip key={t} active onClick={() => set({ tags: value.tags.filter((x) => x !== t) })} aria-label={`Tag ${t} entfernen`}>
                    #{t} ×
                  </Chip>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addTag())}
                placeholder="z. B. Ferien, Geschenk"
                aria-label="Neuer Tag"
                maxLength={24}
              />
              <Button variant="outline" onClick={addTag} disabled={!tagText.trim()}>
                Hinzufügen
              </Button>
            </div>
          </Group>
        </div>
      </details>
    </div>
  );
}
