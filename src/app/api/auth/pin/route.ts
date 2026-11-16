import { changePin } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { requireProfile } from '@/lib/server/session';

export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  const body = await jsonBody(req);
  await changePin(profile, body.current, body.next);
  return { ok: true };
});
