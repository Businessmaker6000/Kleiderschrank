import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { getSession } from "@/lib/server/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const display = Cormorant_Garamond({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Dein digitaler Kleiderschrank und Outfit-Planer.",
  applicationName: "Wardrobe",
  appleWebApp: { capable: true, title: "Wardrobe", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5f1",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // the unlocked profile decides the colour theme
  const session = await getSession().catch(() => null);
  return (
    <html lang="de" data-theme={session?.profile.slug} className={`${geistSans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
