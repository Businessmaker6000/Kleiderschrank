import { redirect } from "next/navigation";
import { ProfileGate } from "@/components/ProfileGate";
import { getAccount, listProfiles, toPublic } from "@/lib/server/auth";
import { getDeviceAccount } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// Entry point: setup → device login → profile selection with PIN.
export default async function Home() {
  if (!(await getAccount())) redirect("/setup");
  const account = await getDeviceAccount();
  if (!account) redirect("/login");
  const profiles = (await listProfiles(account.id)).map(toPublic);
  return <ProfileGate profiles={profiles} />;
}
