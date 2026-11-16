import { jsonBody, route } from '@/lib/server/http';
import type { IdCtx } from '@/lib/server/http';
import { deleteOutfit, updateOutfit } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const PATCH = route<IdCtx>(async (req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  return { outfit: await updateOutfit(profile.id, id, await jsonBody(req)) };
});

export const DELETE = route<IdCtx>(async (_req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  await deleteOutfit(profile.id, id);
  return { ok: true };
});
