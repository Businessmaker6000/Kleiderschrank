import { setupAccount } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { clientIp, setDeviceCookie } from '@/lib/server/session';

export const POST = route(async (req) => {
  const body = await jsonBody(req);
  const account = await setupAccount({ pin: body.pin, setupCode: body.setupCode }, await clientIp());
  await setDeviceCookie(account);
  return { ok: true };
});
