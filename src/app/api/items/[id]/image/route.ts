import { ApiError } from '@/lib/server/errors';
import { route } from '@/lib/server/http';
import type { IdCtx } from '@/lib/server/http';
import { replaceImage } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

// multipart: `image` (file), `width`, `height`, `cutout` ("1" when the background was removed)
export const POST = route<IdCtx>(async (req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof Blob)) throw new ApiError(400, 'Es wurde kein Bild übermittelt.');
  if (file.size > 8 * 1024 * 1024) throw new ApiError(413, 'Das Bild ist zu gross (maximal 8 MB).');
  const item = await replaceImage(profile.id, id, {
    data: Buffer.from(await file.arrayBuffer()),
    width: Number(form!.get('width')),
    height: Number(form!.get('height')),
    cutout: form!.get('cutout') === '1',
  });
  return { item };
});
