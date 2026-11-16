"use client";

import { ArrowLeft, Delete } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PublicProfile } from "@/lib/types";
import { cx } from "./ui";

export function ProfileGate({ profiles }: { profiles: PublicProfile[] }) {
  const [selected, setSelected] = useState<PublicProfile | null>(null);

  // the gate previews the theme of the profile that is about to be opened
  useEffect(() => {
    const root = document.documentElement;
    if (selected) root.dataset.theme = selected.slug;
    else delete root.dataset.theme;
  }, [selected]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-xl text-center"
          >
            <p className="eyebrow">Wardrobe</p>
            <h1 className="mt-4 font-display text-5xl md:text-6xl">Wer zieht sich an?</h1>
            <div className="mt-12 grid grid-cols-2 gap-4 md:gap-6">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-theme={p.slug}
                  onClick={() => setSelected(p)}
                  className="group flex aspect-[3/4] flex-col justify-between rounded-3xl border border-line bg-tile p-5 text-left text-ink transition hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] md:p-7"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary font-display text-2xl text-primary-ink">
                    {p.name[0]}
                  </span>
                  <span>
                    <span className="eyebrow block">Profil</span>
                    <span className="mt-1 block font-display text-4xl md:text-5xl">{p.name}</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full max-w-xs"
          >
            <PinPad profile={selected} onBack={() => setSelected(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function PinPad({ profile, onBack }: { profile: PublicProfile; onBack: () => void }) {
  const [pin, setPinState] = useState("");
  const pinRef = useRef("");
  const setPin = useCallback((value: string) => {
    pinRef.current = value;
    setPinState(value);
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      try {
        await api("/api/auth/unlock", { body: { profileId: profile.id, pin: value }, redirectOn401: false });
        window.location.assign("/today");
      } catch (e) {
        const err = e as Error & { retryAfter?: number; status?: number };
        if (err.status === 401 && !/PIN|Fehlversuche/.test(err.message)) return window.location.assign("/login");
        setError(err.message);
        setWait(err.retryAfter || 0);
        setShake((s) => s + 1);
        setPin("");
        setBusy(false);
      }
    },
    [profile.id, setPin],
  );

  const press = useCallback(
    (digit: string) => {
      if (busy || wait > 0) return;
      setError("");
      if (pinRef.current.length >= 4) return;
      const next = pinRef.current + digit;
      setPin(next);
      if (next.length === 4) void submit(next);
    },
    [busy, wait, submit, setPin],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin(pinRef.current.slice(0, -1));
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, onBack, setPin]);

  const key = "flex h-16 items-center justify-center rounded-full border border-line bg-surface font-display text-3xl transition active:scale-95 active:bg-chip disabled:opacity-40";

  return (
    <div className="text-center">
      <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Profil wechseln
      </button>
      <p className="eyebrow">PIN eingeben</p>
      <h1 className="mt-2 font-display text-5xl">{profile.name}</h1>

      <motion.div
        key={shake}
        animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="mt-8 flex justify-center gap-4"
        role="status"
        aria-label={`${pin.length} von 4 Ziffern eingegeben`}
      >
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx("size-3.5 rounded-full border border-ink/40 transition", i < pin.length && "scale-110 border-primary bg-primary")} />
        ))}
      </motion.div>

      <p role="alert" className="mt-5 min-h-10 text-sm text-danger">
        {wait > 0 ? `Gesperrt. Neuer Versuch in ${wait} s.` : error}
      </p>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={busy || wait > 0}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" className={key} onClick={() => press("0")} disabled={busy || wait > 0}>
          0
        </button>
        <button
          type="button"
          aria-label="Letzte Ziffer löschen"
          className="flex h-16 items-center justify-center rounded-full text-muted transition hover:text-ink active:scale-95"
          onClick={() => setPin(pinRef.current.slice(0, -1))}
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}
