import { enterWithPin } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { clientIp, setDeviceCookie } from '@/lib/server/session';

// The front door: the shared PIN starts the session on this device.
export const POST = route(async (req) => {
  const body = await jsonBody(req);
  const account = await enterWithPin(body.pin, await clientIp());
  await setDeviceCookie(account);
  return { ok: true };
});
