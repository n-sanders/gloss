import { NextResponse } from "next/server";
import { gateCookie, gateOn, rightPassphrase } from "@/lib/gate";
import { allow, clientId } from "@/lib/ratelimit";

export async function POST(req: Request) {
  if (!gateOn()) return NextResponse.json({ ok: true });
  // Ten tries every fifteen minutes from one address: plenty for a family, slow for a guesser.
  if (!allow(`unlock:${clientId(req)}`, 10, 15 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Too many tries. Wait a few minutes, then try again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { passphrase?: unknown };
  const typed = typeof body.passphrase === "string" ? body.passphrase : "";
  if (!typed || !rightPassphrase(typed)) {
    return NextResponse.json({ ok: false, error: "That's not the passphrase." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(gateCookie(req));
  return res;
}
