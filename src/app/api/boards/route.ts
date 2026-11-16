import { jsonBody, route } from '@/lib/server/http';
import { createBoard, listBoards } from '@/lib/server/repo';
import { requireProfile } from '@/lib/server/session';

export const GET = route(async () => {
  const { profile } = await requireProfile();
  return { boards: await listBoards(profile.id) };
});

export const POST = route(async (req) => {
  const { profile } = await requireProfile();
  return { board: await createBoard(profile.id, await jsonBody(req)) };
});
