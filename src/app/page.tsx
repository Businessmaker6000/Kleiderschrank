import { redirect } from "next/navigation";
import { ProfileGate } from "@/components/ProfileGate";
import { getAccount, listProfiles, toPublic } from "@/lib/server/auth";
import { getDeviceAccount } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// Entry point: PIN first, then the choice between Kole and Alisha.
export default async function Home() {
  if (!(await getAccount())) redirect("/setup");
  const account = await getDeviceAccount();
  // profile names and ids are only sent once the PIN was entered on this device
  const profiles = account ? (await listProfiles(account.id)).map(toPublic) : null;
  return <ProfileGate profiles={profiles} />;
}
