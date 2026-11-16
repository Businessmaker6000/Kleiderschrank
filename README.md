# Wardrobe

Privater digitaler Kleiderschrank und Outfit-Planer für zwei Profile (Kole und Alisha).
Mobile-first Web-App, installierbar als PWA.

- **Today** – Begrüssung, Live-Wetter, Outfit des Tages
- **Wardrobe** – Kleidung fotografieren/hochladen, kategorisieren, filtern, suchen
- **Create** – visueller Outfit Builder (Collage, Pfeile, Sperren, Generator)
- **Boards** – gespeicherte Outfits als Masonry-Board mit Kollektionen
- **Profile** – Stilpräferenzen, Standort, PIN und Passwort

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Motion, SWR, Supabase (Postgres + Storage), Open-Meteo.

## Lokal starten

```bash
npm install
npm run dev
```

Dann <http://localhost:3000> öffnen. Ohne Supabase-Variablen läuft die App mit dem **lokalen Treiber**:
Daten liegen in `.data/db.json`, Fotos in `.data/uploads/`. Das ist echte, dauerhafte Speicherung –
aber nur auf diesem einen Rechner. Für den Zugriff von mehreren Geräten braucht es Supabase (siehe unten).

Beim ersten Aufruf führt die App durch die Einrichtung:

1. Gemeinsames Passwort festlegen (mindestens 10 Zeichen). Es meldet neue Geräte an.
2. Profil wählen, PIN eingeben. Start-PIN für beide Profile: `5474`.
3. PIN unter **Profile → Sicherheit** ändern.

## Produktion: Supabase + Hosting

### 1. Supabase-Projekt

1. Auf <https://supabase.com> ein Projekt anlegen (Region z. B. Frankfurt oder Zürich).
2. Im **SQL Editor** den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) ausführen.
   Das legt alle Tabellen, Row Level Security und den privaten Storage-Bucket `wardrobe` an.
3. Unter **Project Settings → API** die **Project URL** und den **service_role key** kopieren.
   Der service_role key ist geheim und gehört ausschliesslich in die Server-Umgebungsvariablen.

### 2. Umgebungsvariablen

Vorlage: [`.env.example`](.env.example). Lokal als `.env.local`, beim Hoster in den Projekt-Einstellungen.

| Variable | Pflicht | Zweck |
| --- | --- | --- |
| `SUPABASE_URL` | Produktion | Project URL des Supabase-Projekts |
| `SUPABASE_SERVICE_ROLE_KEY` | Produktion | Server-Schlüssel für Datenbank und Storage |
| `SESSION_SECRET` | Produktion | Zufallswert, mindestens 32 Zeichen, signiert die Session-Cookies |
| `SETUP_CODE` | Produktion | Einmal-Code für die Ersteinrichtung, damit niemand Fremdes eine frisch veröffentlichte App übernimmt |
| `ANTHROPIC_API_KEY` | optional | Aktiviert die automatische Erkennung von Kategorie, Farbe, Stil usw. beim Upload |
| `ANTHROPIC_MODEL` | optional | Anderes Claude-Modell für die Erkennung (Standard `claude-opus-5-5`) |
| `DATA_DIR` | optional | Ordner des lokalen Treibers (Standard `.data`) |

Zufallswerte erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### 3. Deployment

Die App ist eine normale Next.js-Anwendung, z. B. auf Vercel: Repository importieren, die Variablen setzen, deployen.
Danach die URL öffnen, die Einrichtung mit dem `SETUP_CODE` abschliessen und die App auf dem Handy über
„Zum Home-Bildschirm" installieren. HTTPS ist Pflicht (Kamera, Standort, PWA, sichere Cookies).

## Sicherheit

- **Zwei Stufen.** Das gemeinsame Passwort schützt die App nach aussen (Geräte-Session, 60 Tage).
  Der vierstellige PIN ist die Profilsperre zwischen euch beiden (12 Stunden, dann wieder PIN).
- **Nur gehasht.** Passwort und PINs werden serverseitig mit scrypt und eigenem Salt gespeichert und geprüft.
  Im Frontend steht kein PIN.
- **Schutz gegen Raten.** 5 falsche PINs sperren das Profil für 1 Minute, danach verdoppelt sich die Sperre (maximal 1 Stunde).
  Beim Login: 8 Fehlversuche pro Adresse, zusätzlich eine globale Grenze. Die Zähler liegen in der Datenbank.
- **Profiltrennung auf dem Server.** Der Browser spricht nie direkt mit Supabase. Jede API-Route liest das entsperrte
  Profil aus dem signierten httpOnly-Cookie und filtert jede Abfrage danach. Fotos werden nur über eine geschützte
  Route ausgeliefert; der Storage-Bucket ist privat. RLS ist auf allen Tabellen aktiv und ohne Policies – der
  öffentliche anon-Key kann nichts lesen.
- **Passwort ändern** meldet alle anderen Geräte ab.

Der PIN ist bewusst eine Komfortsperre: Wer das gemeinsame Passwort kennt und den PIN der anderen Person errät,
kommt in deren Profil.

## Tests

```bash
npm test          # 27 Tests: Auth, Sperren, Profiltrennung, Generator, Collage-Layout
npm run lint
npm run typecheck
npm run build
npm run e2e       # gegen einen laufenden Server mit LEEREM Datenspeicher (siehe scripts/e2e.mjs)
```

`npm run e2e` richtet die App ein, meldet drei „Geräte" an, lädt generierte Testbilder hoch und prüft Sessions,
Profiltrennung und Persistenz über echtes HTTP. Danach `.data/` löschen, um wieder leer zu starten.

## Aufbau

```
src/lib/taxonomy.ts          Kategorien, Stile, Farben, Anlässe, Farbharmonie
src/lib/outfit/generator.ts  Regelbasierter Generator mit nachvollziehbarem Scoring
src/lib/outfit/layout.ts     Collage-Vorlagen (überlappungsfrei, per Test abgesichert)
src/lib/server/db.ts         Treiber: Supabase oder lokal (gleiche Schnittstelle)
src/lib/server/auth.ts       Setup, Login, PIN, Passwort
src/lib/server/repo.ts       Alle Datenzugriffe, immer auf ein Profil beschränkt
src/lib/server/ratelimit.ts  Fehlversuchszähler mit eskalierender Sperre
src/app/api/**               API-Routen
src/app/(app)/**             Today, Wardrobe, Create, Boards, Profile
src/components/Collage.tsx   Die Outfit-Collage (Builder, Today, Boards)
supabase/schema.sql          Datenbankschema
```

### Wie der Generator bewertet

Er zieht viele mögliche Kombinationen aus dem eigenen Kleiderschrank, bewertet jede und wählt aus den besten.
Bewertet werden Farbharmonie, Stil-Zusammenhalt, Formalität, gewünschter Stil oder Anlass, Wetter
(Wärmebedarf aus gefühlter Temperatur, Regen, Wind), Saison-Tags, Lieblingsstücke und Abwechslung
(gespeicherte und oft getragene Kombinationen werden seltener vorgeschlagen). Im Builder zeigt „Match" die Einzelwerte.
Ohne Wetterdaten rechnet er mit der Jahreszeit.

## Bekannte Grenzen

- **Hintergrundentfernung** ist nicht eingebaut. Fotos auf hellem Hintergrund verschmelzen durch die Darstellung
  (`mix-blend-mode: multiply`) mit der Collage; Fotos auf dunklem oder unruhigem Hintergrund bleiben als Rechteck sichtbar.
- **Tabellen `categories` / `styles`:** Die festen Kategorien und Stile stehen im Code (`taxonomy.ts`);
  in der Datenbank liegen nur eigene Kategorien (`custom_categories`). Stile sind Text-Arrays an Kleidungsstück und Outfit.
- **Offline:** Die App braucht Internet. Offline erscheint eine Hinweisseite.
- Pro Tabelle werden höchstens 1000 Zeilen pro Profil geladen (Supabase-Standardgrenze) – für zwei Kleiderschränke reichlich.
