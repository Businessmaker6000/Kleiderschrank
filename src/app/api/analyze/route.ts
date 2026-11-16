// Optional AI tagging of a clothing photo. Only active when ANTHROPIC_API_KEY is set;
// the app works fully without it (the client then suggests the colour on-device).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { ApiError } from '@/lib/server/errors';
import { route } from '@/lib/server/http';
import { sniffImage } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';
import { COLORS, GROUPS, MATERIALS, PATTERNS, SEASONS, STYLES } from '@/lib/taxonomy';

const Suggestion = z.object({
  is_clothing: z.boolean(),
  name: z.string(),
  group: z.enum(GROUPS.map((g) => g.id) as [string, ...string[]]),
  type: z.string(),
  colors: z.array(z.enum(COLORS.map((c) => c.id) as [string, ...string[]])),
  pattern: z.enum(PATTERNS as [string, ...string[]]),
  material: z.enum(['Unbekannt', ...MATERIALS] as [string, ...string[]]),
  seasons: z.array(z.enum(SEASONS)),
  styles: z.array(z.enum(STYLES)),
});

const PROMPT = `Das Foto zeigt ein einzelnes Kleidungsstück oder Accessoire aus einem privaten Kleiderschrank.
Beschreibe es für einen digitalen Kleiderschrank.

Wähle "group" und dazu passend "type" aus genau dieser Liste:
${GROUPS.map((g) => `- ${g.id}: ${g.types.join(', ')}`).join('\n')}

- "name": kurzer deutscher Name, höchstens vier Wörter, z. B. "Beiger Strickpullover".
- "colors": ein bis zwei Hauptfarben, die dominante zuerst.
- "material": nur wenn es auf dem Foto klar erkennbar ist, sonst "Unbekannt".
- "seasons": alle Jahreszeiten, in denen man das Stück sinnvoll trägt.
- "styles": zwei bis vier passende Stilrichtungen.
- "is_clothing": false, wenn das Foto kein Kleidungsstück oder Accessoire zeigt.`;

export const POST = route(async (req) => {
  await requireProfile();
  if (!process.env.ANTHROPIC_API_KEY) throw new ApiError(501, 'Die KI-Erkennung ist nicht eingerichtet.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof Blob) || file.size > 4 * 1024 * 1024) throw new ApiError(400, 'Kein gültiges Bild.');
  const data = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) throw new ApiError(415, 'Dieses Bildformat wird nicht unterstützt.');

  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Suggestion) },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: kind.contentType as 'image/jpeg' | 'image/png' | 'image/webp', data: data.toString('base64') },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });
    const s = response.parsed_output;
    if (response.stop_reason === 'refusal' || !s || !s.is_clothing) return { suggestion: null };
    const group = GROUPS.find((g) => g.id === s.group);
    return {
      suggestion: {
        name: s.name.slice(0, 60),
        group: s.group,
        type: group?.types.includes(s.type) ? s.type : (group?.types[0] ?? s.type),
        colors: s.colors.slice(0, 2),
        pattern: s.pattern,
        material: s.material === 'Unbekannt' ? null : s.material,
        seasons: s.seasons,
        styles: s.styles.slice(0, 4),
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ApiError(502, 'Der KI-Schlüssel ist ungültig.');
    if (e instanceof Anthropic.RateLimitError) throw new ApiError(503, 'Die KI-Erkennung ist gerade ausgelastet.');
    if (e instanceof Anthropic.APIError) {
      console.warn('[analyze]', e.status, e.message);
      throw new ApiError(502, 'Die KI-Erkennung ist gerade nicht verfügbar.');
    }
    throw e;
  }
});
