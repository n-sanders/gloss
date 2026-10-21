import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateCookie, gateOn, validToken } from "@/lib/gate";

/** Reachable without the passphrase: the unlock page itself, agents (they carry their own token) and crawler rules. */
const OPEN = [/^\/unlock$/, /^\/api\/unlock$/, /^\/mcp(\/|$)/, /^\/robots\.txt$/, /^\/(icon|apple-icon)\b/];

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!gateOn() || OPEN.some((r) => r.test(pathname))) return NextResponse.next();

  if (!validToken(req.cookies.get(GATE_COOKIE)?.value)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Locked. Unlock the library first." }, { status: 401 });
    const to = new URL("/unlock", req.url);
    if (pathname !== "/") to.searchParams.set("next", pathname + search);
    return NextResponse.redirect(to);
  }

  const res = NextResponse.next();
  // Page visits re-issue the cookie, so it never reaches the browsers' 400-day cap on a computer in use.
  if (!pathname.startsWith("/api/") && req.method === "GET") res.cookies.set(gateCookie(req));
  return res;
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)"],
};
