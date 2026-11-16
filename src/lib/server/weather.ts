// Weather via Open-Meteo (no API key). Coordinates are rounded to ~1 km before they leave the server.
import type { WeatherSnapshot } from '../types';
import { ApiError } from './errors';

const WMO: [number[], string][] = [
  [[0], 'Klar'],
  [[1], 'Überwiegend klar'],
  [[2], 'Teils bewölkt'],
  [[3], 'Bedeckt'],
  [[45, 48], 'Nebel'],
  [[51, 53, 55, 56, 57], 'Nieselregen'],
  [[61, 63, 66], 'Regen'],
  [[65, 67], 'Starker Regen'],
  [[71, 73, 75, 77], 'Schnee'],
  [[80, 81], 'Regenschauer'],
  [[82], 'Heftige Schauer'],
  [[85, 86], 'Schneeschauer'],
  [[95, 96, 99], 'Gewitter'],
];

export function weatherLabel(code: number): string {
  return WMO.find(([codes]) => codes.includes(code))?.[1] || 'Wechselhaft';
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(7000), cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const placeCache = new Map<string, string | null>();

async function reversePlace(lat: number, lon: number): Promise<string | null> {
  const key = `${lat},${lon}`;
  if (placeCache.has(key)) return placeCache.get(key)!;
  let place: string | null = null;
  try {
    const data = (await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=${lat}&lon=${lon}`,
      { 'User-Agent': 'wardrobe-outfit-planner/1.0' },
    )) as { address?: Record<string, string> };
    const a = data.address || {};
    place = a.city || a.town || a.village || a.municipality || a.county || null;
  } catch {
    // the place name is decoration — weather still works without it
  }
  if (placeCache.size > 200) placeCache.clear();
  placeCache.set(key, place);
  return place;
}

export async function fetchWeather(latIn: unknown, lonIn: unknown, placeIn?: unknown): Promise<WeatherSnapshot> {
  if (typeof latIn !== 'number' || typeof lonIn !== 'number' || Math.abs(latIn) > 90 || Math.abs(lonIn) > 180) {
    throw new ApiError(400, 'Ungültiger Standort.');
  }
  const lat = Math.round(latIn * 100) / 100;
  const lon = Math.round(lonIn * 100) / 100;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=1';
  let data: {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
    daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
  };
  try {
    data = (await getJson(url)) as typeof data;
    if (typeof data?.current?.temperature_2m !== 'number') throw new Error('unexpected response');
  } catch (e) {
    console.warn('[weather] unavailable:', (e as Error).message);
    throw new ApiError(503, 'Der Wetterdienst ist gerade nicht erreichbar.');
  }
  const place = typeof placeIn === 'string' && placeIn.trim() ? placeIn.trim().slice(0, 60) : await reversePlace(lat, lon);
  const c = data.current;
  return {
    temp: Math.round(c.temperature_2m),
    feels: Math.round(c.apparent_temperature),
    rainProb: Math.round(data.daily.precipitation_probability_max?.[0] ?? 0),
    wind: Math.round(c.wind_speed_10m),
    code: c.weather_code,
    label: weatherLabel(c.weather_code),
    high: Math.round(data.daily.temperature_2m_max?.[0] ?? c.temperature_2m),
    low: Math.round(data.daily.temperature_2m_min?.[0] ?? c.temperature_2m),
    place,
  };
}

export async function searchCity(q: unknown): Promise<{ name: string; region: string; lat: number; lon: number }[]> {
  const query = typeof q === 'string' ? q.trim().slice(0, 60) : '';
  if (query.length < 2) return [];
  try {
    const data = (await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&format=json&name=${encodeURIComponent(query)}`,
    )) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
    return (data.results || []).map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
    }));
  } catch {
    throw new ApiError(503, 'Die Ortssuche ist gerade nicht erreichbar.');
  }
}
