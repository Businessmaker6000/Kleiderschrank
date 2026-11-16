"use client";

import { LayoutGrid, Shirt, Sparkles, Sun, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { api } from "@/lib/client/api";
import { WeatherProvider } from "@/lib/client/weather";
import type { PublicProfile } from "@/lib/types";
import { ToastProvider, cx } from "./ui";

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/create", label: "Create", icon: Sparkles },
  { href: "/boards", label: "Boards", icon: LayoutGrid },
  { href: "/profile", label: "Profile", icon: User },
];

const ProfileContext = createContext<PublicProfile | null>(null);
export function useProfile(): PublicProfile {
  return useContext(ProfileContext)!;
}

/** Locks the current profile and returns to the profile selection. */
export async function switchProfile() {
  await api("/api/auth/lock", { method: "POST" }).catch(() => {});
  window.location.assign("/");
}

export function AppShell({ profile, children }: { profile: PublicProfile; children: React.ReactNode }) {
  const pathname = usePathname();
  const [switching, setSwitching] = useState(false);

  return (
    <ProfileContext.Provider value={profile}>
      <ToastProvider>
        <WeatherProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-ink">
            Zum Inhalt springen
          </a>
          <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 md:h-16 md:px-8">
              <Link href="/today" className="font-display text-xl tracking-[0.3em]">
                WARDROBE
              </Link>
              <nav aria-label="Hauptnavigation" className="hidden items-center gap-1 md:flex">
                {NAV.map((n) => {
                  const active = pathname.startsWith(n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "rounded-full px-4 py-2 text-[12px] uppercase tracking-[0.18em] transition",
                        active ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={() => {
                  setSwitching(true);
                  void switchProfile();
                }}
                disabled={switching}
                aria-label={`Profil wechseln, aktuell ${profile.name}`}
                title="Profil wechseln"
                className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface pr-3.5 pl-1.5 text-sm transition hover:border-ink/40 active:scale-95 disabled:opacity-50"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary font-display text-base text-primary-ink">
                  {profile.name[0]}
                </span>
                {profile.name}
              </button>
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-10 md:pb-16">
            {children}
          </main>

          <nav
            aria-label="Hauptnavigation"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
          >
            <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
              {NAV.map((n) => {
                const active = pathname.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <li key={n.href} className="flex-1">
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cx("flex h-16 flex-col items-center justify-center gap-1 transition", active ? "text-ink" : "text-muted")}
                    >
                      <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-primary text-primary-ink")}>
                        <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                      </span>
                      <span className="text-[9.5px] uppercase tracking-[0.16em]">{n.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </WeatherProvider>
      </ToastProvider>
    </ProfileContext.Provider>
  );
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-display text-4xl leading-none md:text-5xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}
