import { makeToken } from "@/lib/agent";
import { createToken, listTokens, revokeToken } from "@/lib/db";

export const runtime = "nodejs";

const MAX_TOKENS = 10;

/** The family's agent connections: list them, make one (its token shown once), or revoke one. */
export async function GET() {
  return Response.json({ tokens: await listTokens() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  if ((await listTokens()).length >= MAX_TOKENS) return Response.json({ error: `There are ${MAX_TOKENS} connections. Revoke one first.` }, { status: 409 });
  const t = makeToken();
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 40) : "Agent";
  await createToken(t.id, t.hash, label);
  return Response.json({ id: t.id, label, token: t.token });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await revokeToken(id)) ? Response.json({ ok: true }) : Response.json({ error: "Not found." }, { status: 404 });
}
