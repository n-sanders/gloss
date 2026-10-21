/**
 * The family passphrase. A computer that knows it gets a cookie holding an
 * HMAC of the passphrase, keyed by SESSION_SECRET: the cookie proves the
 * passphrase without containing it, and changing either one signs every
 * computer out.
 *
 * Browsers cap a cookie's life at about 400 days, so the proxy hands out a
 * fresh one on every page visit: a computer used once a year stays unlocked.
 *
 * With no FAMILY_PASSPHRASE set the gate is off, which is handy for local
 * development and nothing else.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "gloss_family";
export const GATE_MAX_AGE = 400 * 24 * 60 * 60;

const passphrase = () => process.env.FAMILY_PASSPHRASE?.trim() || "";

export const gateOn = () => passphrase().length > 0;

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET || `gloss:${passphrase()}`;
  return createHmac("sha256", secret).update(`family:${value}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie value every unlocked computer carries. */
export const gateToken = () => sign(passphrase());

export const validToken = (v: string | undefined) => !!v && gateOn() && same(v, gateToken());

/** Whether a typed passphrase is the family's. Compared as HMACs, so the lengths always match. */
export const rightPassphrase = (typed: string) => gateOn() && same(sign(typed.trim()), gateToken());

/**
 * Secure cookies only travel over HTTPS. COOKIE_SECURE=true or false forces it;
 * left unset, it follows how the request arrived, so plain HTTP on the home network works.
 */
export function secureFor(req: Request): boolean {
  const v = process.env.COOKIE_SECURE?.toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  return proto === "https";
}

export const gateCookie = (req: Request) => ({
  name: GATE_COOKIE,
  value: gateToken(),
  httpOnly: true,
  sameSite: "lax" as const,
  secure: secureFor(req),
  path: "/",
  maxAge: GATE_MAX_AGE,
});
