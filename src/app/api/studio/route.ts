import { ApiError } from '@/lib/server/errors';
import { route } from '@/lib/server/http';
import { sniffImage } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';
import { createStudioImage } from '@/lib/server/studio';

// image generation can take a while
export const maxDuration = 120;

// multipart: `image` — returns the generated product shot as PNG
export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  const form = await req.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof Blob) || file.size > 4 * 1024 * 1024) throw new ApiError(400, 'Kein gültiges Bild.');
  const data = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) throw new ApiError(415, 'Dieses Bildformat wird nicht unterstützt.');
  const image = await createStudioImage(profile.id, data, kind.contentType);
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
});
