import { ApiError } from '@/lib/server/errors';
import { route } from '@/lib/server/http';
import { createItem, listItems } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const GET = route(async () => {
  const { profile } = await requireProfile();
  return { items: await listItems(profile.id) };
});

// multipart: `image` (file), `meta` (JSON), `width`, `height`
export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, 'Der Upload konnte nicht gelesen werden.');
  }
  const file = form.get('image');
  if (!(file instanceof Blob)) throw new ApiError(400, 'Es wurde kein Bild übermittelt.');
  if (file.size > 8 * 1024 * 1024) throw new ApiError(413, 'Das Bild ist zu gross (maximal 8 MB).');
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(form.get('meta') || '{}'));
  } catch {
    throw new ApiError(400, 'Ungültige Angaben zum Kleidungsstück.');
  }
  const item = await createItem(profile.id, meta, {
    data: Buffer.from(await file.arrayBuffer()),
    width: Number(form.get('width')),
    height: Number(form.get('height')),
  });
  return { item };
});
