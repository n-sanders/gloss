import { articleDoc } from "@/lib/db";

export const runtime = "nodejs";

/** One imported text from the shelf, for a computer that has the shelf entry but not the text. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const doc = await articleDoc((await params).id);
  if (!doc) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ doc });
}
