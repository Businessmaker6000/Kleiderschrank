import { jsonBody, route } from '@/lib/server/http';
import { requireProfile } from '@/lib/server/session';
import { fetchWeather } from '@/lib/server/weather';

// POST so coordinates never end up in URLs or logs
export const POST = route(async (req) => {
  await requireProfile();
  const body = await jsonBody(req);
  return { weather: await fetchWeather(body.lat, body.lon, body.place) };
});
