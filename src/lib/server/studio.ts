// Optional "studio image": an image model redraws the photographed garment as a clean
// shop-style product shot. Only active when OPENAI_API_KEY is set. The photo is sent to
// OpenAI for this; without the key the app only cuts the garment out on the device.
import { db } from './db';
import { ApiError } from './errors';

const ENDPOINT = 'https://api.openai.com/v1/images/edits';
const DAILY_LIMIT = 40;

const PROMPT = `Turn the photographed clothing item into a clean e-commerce product photo, like a packshot in an online fashion shop.

Show exactly the one garment or accessory from the input photo and nothing else: front view, straight and symmetric, smooth and wrinkle-free, laid out the way shops present it (invisible-mannequin / flat product shot), fully visible, centred, with a small margin around it.

Stay faithful to the real item. Keep its colour, fabric and texture, cut and length, collar, cuffs, buttons, zips, pockets, seams, prints, labels and logos exactly as they are. Do not invent, add or remove details, and do not change the colour.

No person, no body parts, no hanger, no props, no text, no cast shadow. Even, soft studio lighting. Transparent background.`;

export function studioAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Simple per-profile cap per day: every generated image costs money. */
async function countUse(profileId: string): Promise<void> {
  const key = `studio:${profileId}:${new Date().toISOString().slice(0, 10)}`;
  const row = (await db().select<{ key: string; count: number }>('rate_limits', { key }))[0];
  if (row && row.count >= DAILY_LIMIT) throw new ApiError(429, `Heute wurden bereits ${DAILY_LIMIT} Studiobilder erzeugt. Morgen geht es weiter.`);
  if (row) await db().update('rate_limits', { key }, { count: row.count + 1 });
  else await db().insert('rate_limits', [{ key, count: 1, window_start: Date.now(), lockouts: 0, locked_until: 0 }]);
}

async function request(image: Buffer, contentType: string, transparent: boolean): Promise<Response> {
  const form = new FormData();
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
  form.append('image', new Blob([new Uint8Array(image)], { type: contentType }), contentType === 'image/png' ? 'photo.png' : contentType === 'image/webp' ? 'photo.webp' : 'photo.jpg');
  form.append('prompt', transparent ? PROMPT : PROMPT.replace('Transparent background.', 'Plain, pure white background.'));
  form.append('size', '1024x1536');
  form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
  form.append('output_format', 'png');
  form.append('n', '1');
  if (transparent) form.append('background', 'transparent');
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(110_000),
  });
}

export async function createStudioImage(profileId: string, image: Buffer, contentType: string): Promise<Buffer> {
  if (!studioAvailable()) throw new ApiError(501, 'Die Studiobild-Funktion ist nicht eingerichtet.');
  await countUse(profileId);

  let res: Response;
  try {
    res = await request(image, contentType, true);
    if (res.status === 400) {
      const detail = await res.clone().text();
      // some models cannot draw transparency: ask for white instead, the app cuts it out afterwards
      if (/background|transparen/i.test(detail)) res = await request(image, contentType, false);
    }
  } catch (e) {
    console.warn('[studio] request failed:', (e as Error).message);
    throw new ApiError(504, 'Die Bild-KI hat zu lange gebraucht. Bitte noch einmal versuchen.');
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.warn('[studio]', res.status, detail);
    if (res.status === 401) throw new ApiError(502, 'Der Schlüssel für die Bild-KI ist ungültig.');
    if (res.status === 429) throw new ApiError(503, 'Die Bild-KI ist gerade ausgelastet oder das Guthaben ist aufgebraucht.');
    if (res.status === 400 && /safety|moderation|policy/i.test(detail)) throw new ApiError(422, 'Die Bild-KI hat dieses Foto abgelehnt.');
    if (res.status === 404 || /model/i.test(detail)) throw new ApiError(502, 'Das eingestellte Bild-Modell ist nicht verfügbar (OPENAI_IMAGE_MODEL prüfen).');
    throw new ApiError(502, 'Die Bild-KI ist gerade nicht verfügbar.');
  }

  const data = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new ApiError(502, 'Die Bild-KI hat kein Bild geliefert.');
  return Buffer.from(b64, 'base64');
}
