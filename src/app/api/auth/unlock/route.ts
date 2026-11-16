import { toPublic, unlockProfile } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { requireAccount, setProfileCookie } from '@/lib/server/session';

export const POST = route(async (req) => {
  const account = await requireAccount();
  const body = await jsonBody(req);
  const profile = await unlockProfile(account.id, body.profileId, body.pin);
  await setProfileCookie(profile);
  return { profile: toPublic(profile) };
});
