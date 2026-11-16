import type { Group, Slot } from './taxonomy.ts';

export type ProfileSlug = 'kole' | 'alisha';

export interface PublicProfile {
  id: string;
  slug: ProfileSlug;
  name: string;
}

export interface ItemImage {
  path: string;
  width: number;
  height: number;
}

export interface Item {
  id: string;
  name: string;
  group: Group;
  type: string;
  slot: Slot;
  colors: string[];
  pattern: string | null;
  material: string | null;
  seasons: string[];
  styles: string[];
  tags: string[];
  favorite: boolean;
  wear_count: number;
  created_at: string;
  image: ItemImage | null;
}

export interface WeatherSnapshot {
  temp: number;
  feels: number;
  rainProb: number;
  wind: number;
  code: number;
  label: string;
  high: number;
  low: number;
  place: string | null;
}

export interface OutfitEntry {
  slot: Slot;
  item_id: string;
}

export interface Outfit {
  id: string;
  name: string;
  styles: string[];
  season: string | null;
  occasion: string | null;
  note: string | null;
  favorite: boolean;
  worn_count: number;
  weather: WeatherSnapshot | null;
  created_at: string;
  updated_at: string;
  items: OutfitEntry[];
  board_ids: string[];
}

export interface Board {
  id: string;
  name: string;
  created_at: string;
}

export interface Prefs {
  use_location: boolean;
  city: string | null;
  lat: number | null;
  lon: number | null;
  favorite_styles: string[];
}

export interface CustomCategory {
  id: string;
  name: string;
  group: Group;
}

export function imageUrl(item: Pick<Item, 'image'>): string | null {
  return item.image ? `/api/images/${item.image.path}` : null;
}
