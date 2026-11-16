import { appIcon } from "@/lib/appIcon";

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size } = await ctx.params;
  if (size !== "192" && size !== "512") return new Response("Not found", { status: 404 });
  return appIcon(Number(size));
}
