import { toPublic } from '@/lib/server/auth';
import { route } from '@/lib/server/http';
import { getPrefs, listCategories } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const GET = route(async () => {
  const { profile } = await requireProfile();
  const [prefs, categories] = await Promise.all([getPrefs(profile.id), listCategories(profile.id)]);
  return {
    profile: toPublic(profile),
    prefs,
    categories,
    pinChanged: !!profile.pin_changed,
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
  };
});
