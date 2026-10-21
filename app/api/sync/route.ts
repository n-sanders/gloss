import { isCollection, pullRows, pushRows, type Collection, type PushRow } from "@/lib/db";
import { ensureTopics } from "@/lib/topics-server";

export const runtime = "nodejs";

/** The client batches below this. */
const MAX_BODY = 4_400_000;
const MAX_ROWS = 2000;
const MAX_DATA = 256_000;

type InRow = { id: string; articleId: string; data: unknown; deleted?: boolean; doc?: unknown };

/**
 * Pull: every shelf row that changed since `since`, tombstones included.
 * Article texts are left out; they are fetched one at a time from
 * /api/articles/[id], so a big shelf never makes a huge response.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : "1970-01-01T00:00:00.000Z";
  // A new library starts with the default topics, so the first pull brings them.
  await ensureTopics();
  return Response.json(await pullRows(since));
}

/** Push: upsert the rows a computer changed. */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "Too large." }, { status: 413 });

  let body: { changes?: Record<string, InRow[]> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const changes: Partial<Record<Collection, PushRow[]>> = {};
  let count = 0;
  for (const [table, rows] of Object.entries(body.changes ?? {})) {
    if (!isCollection(table) || !Array.isArray(rows)) continue;
    changes[table] = rows.filter(valid).map((r) => ({
      id: r.id,
      data: r.deleted ? {} : r.data,
      deleted: Boolean(r.deleted),
      ...(table === "articles" ? { doc: r.deleted ? null : r.doc ?? null } : {}),
    }));
    count += changes[table].length;
  }
  if (count > MAX_ROWS) return Response.json({ error: "Too many rows in one push." }, { status: 413 });
  await pushRows(changes);
  return Response.json({ ok: true, count });
}

function valid(r: InRow): boolean {
  if (!r || typeof r.id !== "string" || !r.id || r.id.length > 120) return false;
  if (r.deleted) return true;
  return typeof r.data === "object" && r.data !== null && JSON.stringify(r.data).length <= MAX_DATA;
}
