import { jsonBody, route } from '@/lib/server/http';
import { updatePrefs } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const PATCH = route(async (req) => {
  const { profile } = await requireProfile();
  return { prefs: await updatePrefs(profile.id, await jsonBody(req)) };
});
