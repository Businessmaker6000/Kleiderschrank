"use client";

import { Delete, Lock } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { PublicProfile } from "@/lib/types";
import { cx } from "./ui";

/** Start page: the PIN pad, and once the PIN was entered the choice between the two profiles. */
export function ProfileGate({ profiles }: { profiles: PublicProfile[] | null }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx("w-full", profiles ? "max-w-xl" : "max-w-xs")}>
        {profiles ? <Chooser profiles={profiles} /> : <PinPad />}
      </motion.div>
    </main>
  );
}

function Chooser({ profiles }: { profiles: PublicProfile[] }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function open(profile: PublicProfile) {
    setOpening(profile.id);
    setError("");
    try {
      await api("/api/auth/unlock", { body: { profileId: profile.id }, redirectOn401: false });
      window.location.assign("/today");
    } catch (e) {
      const err = e as Error & { status?: number };
      // session ran out in the meantime: back to the PIN
      if (err.status === 401) return window.location.reload();
      setError(err.message);
      setOpening(null);
    }
  }

  async function lock() {
    await api("/api/auth/logout", { method: "POST", redirectOn401: false }).catch(() => {});
    window.location.reload();
  }

  return (
    <div className="text-center">
      <p className="eyebrow">Wardrobe</p>
      <h1 className="mt-4 font-display text-5xl md:text-6xl">Wer zieht sich an?</h1>
      <div className="mt-12 grid grid-cols-2 gap-4 md:gap-6">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            data-theme={p.slug}
            onClick={() => open(p)}
            disabled={opening !== null}
            className={cx(
              "group flex aspect-[3/4] flex-col justify-between rounded-3xl border border-line bg-tile p-5 text-left text-ink transition hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] md:p-7",
              opening && opening !== p.id && "opacity-40",
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary font-display text-2xl text-primary-ink">{p.name[0]}</span>
            <span>
              <span className="eyebrow block">Profil</span>
              <span className="mt-1 block font-display text-4xl md:text-5xl">{p.name}</span>
            </span>
          </button>
        ))}
      </div>
      <p role="alert" className="mt-5 min-h-5 text-sm text-danger">
        {error}
      </p>
      <button type="button" onClick={lock} className="mt-4 inline-flex items-center gap-2 text-sm text-muted transition hover:text-ink">
        <Lock className="size-3.5" aria-hidden /> Sperren
      </button>
    </div>
  );
}

function PinPad() {
  const [pin, setPinState] = useState("");
  const pinRef = useRef("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [wait, setWait] = useState(0);

  const setPin = useCallback((value: string) => {
    pinRef.current = value;
    setPinState(value);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      try {
        await api("/api/auth/login", { body: { pin: value }, redirectOn401: false });
        // reload: the server now shows the profile choice
        window.location.reload();
      } catch (e) {
        const err = e as Error & { retryAfter?: number };
        setError(err.message);
        setWait(err.retryAfter || 0);
        setShake((s) => s + 1);
        setPin("");
        setBusy(false);
      }
    },
    [setPin],
  );

  const press = useCallback(
    (digit: string) => {
      if (busy || wait > 0 || pinRef.current.length >= 4) return;
      setError("");
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, setPin]);

  const key =
    "flex h-16 items-center justify-center rounded-full border border-line bg-surface font-display text-3xl transition active:scale-95 active:bg-chip disabled:opacity-40";

  return (
    <div className="text-center">
      <p className="eyebrow">Wardrobe</p>
      <h1 className="mt-3 font-display text-5xl">PIN eingeben</h1>

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
