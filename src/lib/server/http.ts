import { ApiError } from './errors';

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {}
  if (!host || originHost !== host) throw new ApiError(403, 'Anfrage von fremder Herkunft abgelehnt.');
}

/** Wraps a route handler: origin check, JSON serialisation and uniform error responses. */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof ApiError) {
        return Response.json({ error: e.message, ...e.extra }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}`, e);
      return Response.json({ error: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.' }, { status: 500 });
    }
  };
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  throw new ApiError(400, 'Ungültige Anfrage.');
}

export type IdCtx = { params: Promise<{ id: string }> };
