import { changePin } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { clientIp, requireProfile, setDeviceCookie } from '@/lib/server/session';

export const POST = route(async (req) => {
  const { account } = await requireProfile();
  const body = await jsonBody(req);
  // every other device is signed out; this one gets a fresh session
  const updated = await changePin(account, body.current, body.next, await clientIp());
  await setDeviceCookie(updated);
  return { ok: true };
});
