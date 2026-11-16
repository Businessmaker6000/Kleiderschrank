import { redirect } from "next/navigation";
import { AuthFrame, SetupForm } from "@/components/AuthForms";
import { getAccount, setupCodeRequired } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getAccount()) redirect("/");
  return (
    <AuthFrame
      eyebrow="Wardrobe · Einrichtung"
      title="Willkommen."
      text="Einmalig legt ihr ein gemeinsames Passwort fest. Es schützt die App nach aussen; die PINs trennen danach eure beiden Profile."
    >
      <SetupForm needsCode={setupCodeRequired()} />
    </AuthFrame>
  );
}
