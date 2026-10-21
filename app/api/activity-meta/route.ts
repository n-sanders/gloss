import { fetchMeta } from "@/lib/fetch-article";
import { allow, clientId } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** A link's title, description and picture, to start an activity's details from. */
export async function POST(req: Request) {
  if (!allow(`meta:${clientId(req)}`, 60, 60_000)) return Response.json({ error: "Too many at once. Wait a moment." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  if (typeof body.url !== "string" || !body.url.trim()) return Response.json({ error: "Send a link." }, { status: 400 });
  const r = await fetchMeta(body.url);
  if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ meta: r.meta });
}
