import { changePassword } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { clientIp, requireProfile, setDeviceCookie } from '@/lib/server/session';

export const POST = route(async (req) => {
  const { account } = await requireProfile();
  const body = await jsonBody(req);
  // all other devices are signed out; this one gets a fresh session
  const updated = await changePassword(account, body.current, body.next, await clientIp());
  await setDeviceCookie(updated);
  return { ok: true };
});
