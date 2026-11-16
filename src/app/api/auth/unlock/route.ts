import { openProfile, toPublic } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { requireAccount, setProfileCookie } from '@/lib/server/session';

// After the PIN: pick Kole or Alisha.
export const POST = route(async (req) => {
  const account = await requireAccount();
  const body = await jsonBody(req);
  const profile = await openProfile(account.id, body.profileId);
  await setProfileCookie(profile);
  return { profile: toPublic(profile) };
});
