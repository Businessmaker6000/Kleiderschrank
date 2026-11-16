import { route } from '@/lib/server/http';
import type { IdCtx } from '@/lib/server/http';
import { deleteCategory } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const DELETE = route<IdCtx>(async (_req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  await deleteCategory(profile.id, id);
  return { ok: true };
});
