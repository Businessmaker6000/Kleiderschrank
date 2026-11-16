import { login } from '@/lib/server/auth';
import { jsonBody, route } from '@/lib/server/http';
import { clientIp, setDeviceCookie } from '@/lib/server/session';

export const POST = route(async (req) => {
  const body = await jsonBody(req);
  const account = await login(body.password, await clientIp());
  await setDeviceCookie(account);
  return { ok: true };
});
