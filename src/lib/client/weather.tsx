"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { WeatherSnapshot } from "@/lib/types";
import { api, useMe } from "./api";

// Weather is optional everywhere: every state except "ready" simply means the generator
// falls back to the season.
export type WeatherStatus =
  | "loading"
  | "ready"
  | "needs-permission" // browser has not been asked yet — we only ask after a tap
  | "denied" // location blocked: offer manual city
  | "unavailable"; // weather service or network down

interface WeatherState {
  status: WeatherStatus;
  weather: WeatherSnapshot | null;
  /** asks the browser for the position (shows the permission prompt if needed) */
  requestLocation: () => void;
  refresh: () => void;
}

const Ctx = createContext<WeatherState>({ status: "loading", weather: null, requestLocation: () => {}, refresh: () => {} });
export const useWeather = () => useContext(Ctx);

const CACHE_KEY = "wd:weather";
const MAX_AGE = 20 * 60 * 1000;

export function WeatherProvider({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const [status, setStatus] = useState<WeatherStatus>("loading");
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const run = useRef(0);

  const prefs = me?.prefs;
  const profileId = me?.profile.id;
  const sourceKey = prefs ? `${profileId}|${prefs.city && prefs.lat != null ? `${prefs.lat},${prefs.lon}` : prefs.use_location ? "geo" : "off"}` : null;

  const load = useCallback(
    async (lat: number, lon: number, place: string | null, id: number) => {
      try {
        const { weather: w } = await api<{ weather: WeatherSnapshot }>("/api/weather", { body: { lat, lon, place } });
        if (run.current !== id) return;
        setWeather(w);
        setStatus("ready");
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), key: sourceKey, weather: w }));
        } catch {}
      } catch {
        if (run.current === id) setStatus("unavailable");
      }
    },
    [sourceKey],
  );

  const locate = useCallback(
    (id: number) => {
      if (!("geolocation" in navigator)) return setStatus("denied");
      setStatus("loading");
      navigator.geolocation.getCurrentPosition(
        (pos) => void load(pos.coords.latitude, pos.coords.longitude, null, id),
        (err) => run.current === id && setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
        { maximumAge: 10 * 60 * 1000, timeout: 12000 },
      );
    },
    [load],
  );

  const start = useCallback(
    async (force: boolean) => {
      if (!prefs) return;
      const id = ++run.current;
      if (!force) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
          if (cached && cached.key === sourceKey && Date.now() - cached.t < MAX_AGE) {
            setWeather(cached.weather);
            setStatus("ready");
            return;
          }
        } catch {}
      }
      setWeather(null);
      if (prefs.city && prefs.lat != null && prefs.lon != null) {
        setStatus("loading");
        return void load(prefs.lat, prefs.lon, prefs.city, id);
      }
      if (!prefs.use_location) return setStatus("denied");
      // only locate silently when permission was already given; otherwise wait for a tap
      let permission = "prompt";
      try {
        permission = (await navigator.permissions.query({ name: "geolocation" })).state;
      } catch {}
      if (run.current !== id) return;
      if (permission === "granted") locate(id);
      else setStatus(permission === "denied" ? "denied" : "needs-permission");
    },
    [prefs, sourceKey, load, locate],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs with browser geolocation / session cache
    void start(false);
  }, [start]);

  const requestLocation = useCallback(() => locate(++run.current), [locate]);
  const refresh = useCallback(() => void start(true), [start]);

  return <Ctx.Provider value={{ status, weather, requestLocation, refresh }}>{children}</Ctx.Provider>;
}
