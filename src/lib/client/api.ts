"use client";

import useSWR from "swr";
import type { Board, CustomCategory, Item, Outfit, Prefs, PublicProfile } from "@/lib/types";

export class RequestError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** JSON request against the app's own API. Sends the session cookie, throws a readable error. */
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; redirectOn401?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method || (options.body ? "POST" : "GET"),
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new RequestError(0, "Keine Verbindung. Bitte Internet prüfen und erneut versuchen.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && options.redirectOn401 !== false && typeof window !== "undefined") {
      // session expired or profile locked: back to the profile selection
      window.location.assign("/");
    }
    throw new RequestError(res.status, data.error || "Etwas ist schiefgelaufen.", data.retryAfter);
  }
  return data as T;
}

/** Multipart upload with progress (fetch cannot report upload progress). */
export function upload<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new RequestError(0, "Keine Verbindung. Der Upload wurde nicht gespeichert."));
    xhr.onload = () => {
      const data = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        if (xhr.status === 401) window.location.assign("/");
        reject(new RequestError(xhr.status, data.error || "Der Upload ist fehlgeschlagen."));
      }
    };
    xhr.send(form);
  });
}

export interface Me {
  profile: PublicProfile;
  prefs: Prefs;
  categories: CustomCategory[];
  pinChanged: boolean;
  aiAvailable: boolean;
}

const fetcher = <T,>(path: string) => api<T>(path);
const swrOptions = { revalidateOnFocus: false, shouldRetryOnError: false };

export function useMe() {
  return useSWR<Me>("/api/me", fetcher, swrOptions);
}
export function useItems() {
  const r = useSWR<{ items: Item[] }>("/api/items", fetcher, swrOptions);
  return { ...r, items: r.data?.items };
}
export function useOutfits() {
  const r = useSWR<{ outfits: Outfit[] }>("/api/outfits", fetcher, swrOptions);
  return { ...r, outfits: r.data?.outfits };
}
export function useBoards() {
  const r = useSWR<{ boards: Board[] }>("/api/boards", fetcher, swrOptions);
  return { ...r, boards: r.data?.boards };
}
