import { jsonBody, route } from '@/lib/server/http';
import { requireProfile } from '@/lib/server/session';
import { searchCity } from '@/lib/server/weather';

export const POST = route(async (req) => {
  await requireProfile();
  const body = await jsonBody(req);
  return { results: await searchCity(body.q) };
});
