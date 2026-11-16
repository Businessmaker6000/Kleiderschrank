import { redirect } from "next/navigation";
import { AuthFrame, LoginForm } from "@/components/AuthForms";
import { getAccount } from "@/lib/server/auth";
import { getDeviceAccount } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await getAccount())) redirect("/setup");
  if (await getDeviceAccount()) redirect("/");
  return (
    <AuthFrame eyebrow="Wardrobe" title="Anmelden." text="Dieses Gerät ist noch nicht angemeldet. Gib euer gemeinsames Passwort ein.">
      <LoginForm />
    </AuthFrame>
  );
}
