import { ApiError } from '@/lib/server/errors';
import { route } from '@/lib/server/http';
import { readImage } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

// Images are never public: they are streamed through this route, which only serves
// files that belong to the unlocked profile.
export const GET = route<{ params: Promise<{ path: string[] }> }>(async (_req, ctx) => {
  const { profile } = await requireProfile();
  const { path } = await ctx.params;
  const image = await readImage(profile.id, path.join('/'));
  if (!image) throw new ApiError(404, 'Bild nicht gefunden.');
  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.contentType,
      // file names are unique per upload, so the browser may keep them
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
