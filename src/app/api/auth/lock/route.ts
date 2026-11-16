import { route } from '@/lib/server/http';
import { clearProfileCookie } from '@/lib/server/session';

export const POST = route(async () => {
  await clearProfileCookie();
  return { ok: true };
});
