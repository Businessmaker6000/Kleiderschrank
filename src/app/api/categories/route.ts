import { jsonBody, route } from '@/lib/server/http';
import { createCategory } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  return { category: await createCategory(profile.id, await jsonBody(req)) };
});
