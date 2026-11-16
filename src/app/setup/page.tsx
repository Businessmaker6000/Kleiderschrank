import { redirect } from "next/navigation";
import { AuthFrame, SetupForm } from "@/components/AuthForms";
import { getAccount, setupCodeRequired } from "@/lib/server/auth";
import { hasPublicKeyInsteadOfSecret } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getAccount()) redirect("/");

  // The most common deployment mistake: the public key was pasted instead of the secret one.
  // With it nothing can be saved, so explain the fix instead of showing a form that would fail.
  if (hasPublicKeyInsteadOfSecret()) {
    return (
      <AuthFrame
        eyebrow="Wardrobe · Einrichtung"
        title="Fast geschafft."
        text="Die App erreicht die Datenbank, darf aber noch nichts speichern: In Vercel ist der öffentliche Schlüssel eingetragen statt des geheimen."
      >
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            In Supabase: Zahnrad → <strong>API Keys</strong>. Den Schlüssel <strong>service_role</strong> (Reiter „Legacy API Keys“) oder den{" "}
            <strong>Secret key</strong> (beginnt mit <code>sb_secret_</code>) kopieren – nicht „anon“ und nicht „publishable“.
          </li>
          <li>
            In Vercel: Projekt → <strong>Settings → Environment Variables</strong> → bei <code>SUPABASE_SERVICE_ROLE_KEY</code> auf{" "}
            <strong>Edit</strong>, den kopierten Schlüssel einfügen, <strong>Save</strong>.
          </li>
          <li>
            In Vercel: <strong>Deployments</strong> → oberster Eintrag → drei Punkte → <strong>Redeploy</strong>.
          </li>
          <li>Diese Seite nach etwa zwei Minuten neu laden.</li>
        </ol>
      </AuthFrame>
    );
  }

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
