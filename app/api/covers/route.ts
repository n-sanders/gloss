import { saveCover } from "@/lib/db";
import { TOPIC, topicOf } from "@/lib/library";
import { paintCover } from "@/lib/paint";
import { loadTopics } from "@/lib/topics-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Paint a cover for one book. It is kept on the server, so other computers
 * fetch it instead of painting it again. The picture comes back as it was made.
 */
export async function POST(req: Request) {
  let body: { id?: string; scene?: string; topic?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.slice(0, 120) : "";
  const scene = typeof body.scene === "string" ? body.scene.slice(0, 300).trim() : "";
  if (!id || !scene) return Response.json({ error: "id and scene are required." }, { status: 400 });

  await loadTopics();
  const r = await paintCover({ scene, inks: TOPIC[topicOf(body.topic)].inks, signal: req.signal });
  if (!r.ok) return Response.json({ error: r.error, code: r.code }, { status: r.code === "not_configured" ? 503 : 502 });
  await saveCover(id, r.image, r.mime);
  return new Response(new Blob([r.image as Uint8Array<ArrayBuffer>], { type: r.mime }), { headers: { "Content-Type": r.mime, "Cache-Control": "private, no-store" } });
}
