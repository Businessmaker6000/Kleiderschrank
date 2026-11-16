import { route } from '@/lib/server/http';
import type { IdCtx } from '@/lib/server/http';
import { duplicateOutfit } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const POST = route<IdCtx>(async (_req, ctx) => {
  const { profile } = await requireProfile();
  const { id } = await ctx.params;
  return { outfit: await duplicateOutfit(profile.id, id) };
});
