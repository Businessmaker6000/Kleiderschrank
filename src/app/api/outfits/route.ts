import { jsonBody, route } from '@/lib/server/http';
import { createOutfit, listOutfits } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const GET = route(async () => {
  const { profile } = await requireProfile();
  return { outfits: await listOutfits(profile.id) };
});

export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  return { outfit: await createOutfit(profile.id, await jsonBody(req)) };
});
