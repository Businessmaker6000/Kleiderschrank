import { route } from '@/lib/server/http';
import { clearAllCookies } from '@/lib/server/session';

export const POST = route(async () => {
  await clearAllCookies();
  return { ok: true };
});
