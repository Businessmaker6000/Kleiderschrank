import { jsonBody, route } from '@/lib/server/http';
import type { IdCtx } from '@/lib/server/http';
import { deleteItem, updateItem } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const PATCH = route<IdCtx>(async (req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  return { item: await updateItem(profile.id, id, await jsonBody(req)) };
});

export const DELETE = route<IdCtx>(async (_req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  await deleteItem(profile.id, id);
  return { ok: true };
});
