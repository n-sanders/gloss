import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { gateCookie } from "@/lib/gate";
import { LIBRARY_NAME_KEY, aiConfigured, envModel, settingKey } from "@/lib/model-config";
import { SLOTS, isSlot } from "@/lib/models";
import { searchEnabled } from "@/lib/search";
import { passphraseIsDefault, rotateSessionSecret, setExaKey, setOpenRouterKey, setPassphrase } from "@/lib/secrets";

export const runtime = "nodejs";

const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/;

/** A pasted key, null to clear the saved one, or "bad" when it isn't usable. */
function cleanKey(v: unknown): string | null | "bad" {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return "bad";
  const t = v.trim();
  if (!t) return null;
  if (t.length > 400) return "bad";
  return t;
}

/** The family's settings: the passphrase, the API keys, which model does each job, and what the library is called. Raw secrets stay on the server. */
export async function GET() {
  return Response.json({
    ai: aiConfigured(),
    search: searchEnabled(),
    passphraseIsDefault: passphraseIsDefault(),
    libraryName: getSetting(LIBRARY_NAME_KEY) ?? "",
    slots: SLOTS.map((s) => {
      const saved = getSetting(settingKey(s.key));
      const env = process.env[s.env]?.trim();
      return { key: s.key, saved: saved ?? null, fromEnv: env || null, model: saved || envModel(s.key), fallback: s.fallback };
    }),
  });
}

/**
 * `models`: a model id per slot, or null to go back to the environment's or the default.
 * `passphrase` replaces the family's passphrase. `openrouterKey` and `exaKey` save or, as null, clear.
 * `signOut` replaces the signing secret. Saving a passphrase or signing out sets a fresh cookie on this computer.
 */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    models?: Record<string, unknown>;
    libraryName?: unknown;
    passphrase?: unknown;
    openrouterKey?: unknown;
    exaKey?: unknown;
    signOut?: unknown;
  };

  let nextPassphrase: string | undefined;
  if (body.passphrase !== undefined) {
    if (typeof body.passphrase !== "string") return NextResponse.json({ error: "Type a passphrase." }, { status: 400 });
    const p = body.passphrase.trim();
    if (!p) return NextResponse.json({ error: "Type a passphrase." }, { status: 400 });
    if (p.length > 200) return NextResponse.json({ error: "That passphrase is too long." }, { status: 400 });
    nextPassphrase = p;
  }

  let nextOpenRouter: string | null | undefined;
  if (body.openrouterKey !== undefined) {
    const key = cleanKey(body.openrouterKey);
    if (key === "bad") return NextResponse.json({ error: "Could not save that OpenRouter key." }, { status: 400 });
    nextOpenRouter = key;
  }

  let nextExa: string | null | undefined;
  if (body.exaKey !== undefined) {
    const key = cleanKey(body.exaKey);
    if (key === "bad") return NextResponse.json({ error: "Could not save that Exa key." }, { status: 400 });
    nextExa = key;
  }

  for (const [slot, v] of Object.entries(body.models ?? {})) {
    if (!isSlot(slot)) return NextResponse.json({ error: `Unknown model slot: ${slot}` }, { status: 400 });
    if (v === null || v === "") setSetting(settingKey(slot), null);
    else if (typeof v === "string" && v.length < 200 && MODEL_ID.test(v.trim())) setSetting(settingKey(slot), v.trim());
    else return NextResponse.json({ error: "A model is named like vendor/model, as OpenRouter lists it." }, { status: 400 });
  }
  if (body.libraryName !== undefined) {
    const name = typeof body.libraryName === "string" ? body.libraryName.trim().slice(0, 60) : "";
    setSetting(LIBRARY_NAME_KEY, name || null);
  }

  let refreshCookie = false;
  if (nextPassphrase !== undefined) {
    setPassphrase(nextPassphrase);
    refreshCookie = true;
  }
  if (nextOpenRouter !== undefined) setOpenRouterKey(nextOpenRouter);
  if (nextExa !== undefined) setExaKey(nextExa);
  if (body.signOut === true) {
    rotateSessionSecret();
    refreshCookie = true;
  }

  const res = NextResponse.json({ ok: true });
  if (refreshCookie) res.cookies.set(gateCookie(req));
  return res;
}
