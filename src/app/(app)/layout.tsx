import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { toPublic } from "@/lib/server/auth";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// Everything inside (app) requires an unlocked profile.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  return <AppShell profile={toPublic(session.profile)}>{children}</AppShell>;
}
