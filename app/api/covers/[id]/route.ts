import { deleteCover, loadCover, saveCover } from "@/lib/db";

export const runtime = "nodejs";

const MAX_BYTES = 6_000_000;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** A book's cover, painted or uploaded. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await loadCover((await params).id);
  if (!c) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(new Blob([c.image as Uint8Array<ArrayBuffer>], { type: c.mime }), { headers: { "Content-Type": c.mime, "Cache-Control": "private, no-cache" } });
}

/** Upload a cover: the raw image as the body. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id.slice(0, 120);
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(mime)) return Response.json({ error: "Upload a JPEG, PNG, WebP or GIF." }, { status: 415 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return Response.json({ error: "That image is too large (6 MB at most)." }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return Response.json({ error: "The image was empty." }, { status: 400 });
  if (bytes.length > MAX_BYTES) return Response.json({ error: "That image is too large (6 MB at most)." }, { status: 413 });
  await saveCover(id, bytes, mime);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await deleteCover((await params).id);
  return Response.json({ ok: true });
}
