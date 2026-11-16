"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { mutate } from "swr";
import { api } from "@/lib/client/api";
import { useWeather } from "@/lib/client/weather";
import { ErrorText, Input, Sheet } from "./ui";

interface Place {
  name: string;
  region: string;
  lat: number;
  lon: number;
}

/** Manual city choice (used when location access is off or denied) and the way back to live location. */
export function CityPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { requestLocation } = useWeather();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const { results } = await api<{ results: Place[] }>("/api/geocode", { body: { q: query } });
        if (!stale) {
          setResults(results);
          setError("");
        }
      } catch (e) {
        if (!stale) setError((e as Error).message);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  async function save(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      await api("/api/preferences", { method: "PATCH", body });
      await mutate("/api/me");
      after?.();
      setQ("");
      setResults(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shown = q.trim().length >= 2 ? results : null;

  return (
    <Sheet open={open} onClose={onClose} title="Standort">
      <div className="space-y-4 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ city: null, use_location: true }, requestLocation)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left text-sm transition hover:border-ink/40 disabled:opacity-50"
        >
          <LocateFixed className="size-5 text-accent" strokeWidth={1.5} aria-hidden />
          <span>
            <span className="block font-medium">Aktuellen Standort verwenden</span>
            <span className="text-muted">Der Browser fragt nach der Berechtigung.</span>
          </span>
        </button>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stadt suchen" aria-label="Stadt suchen" autoComplete="off" />
        <ErrorText>{error}</ErrorText>
        {shown && shown.length === 0 && <p className="text-sm text-muted">Kein Ort gefunden.</p>}
        {shown && shown.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save({ city: p.name, lat: p.lat, lon: p.lon })}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition hover:bg-chip"
                >
                  <MapPin className="size-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-xs text-muted">{p.region}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
