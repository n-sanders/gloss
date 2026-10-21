import { getSetting, setSetting } from "@/lib/db";
import { LIBRARY_NAME_KEY, aiConfigured, envModel, settingKey } from "@/lib/model-config";
import { SLOTS, isSlot } from "@/lib/models";

export const runtime = "nodejs";

const MODEL_ID = /^[\w.-]+\/[\w.:-]+$/;

/** The family's settings: which model does each job, and what the library is called. */
export async function GET() {
  return Response.json({
    ai: aiConfigured(),
    search: Boolean(process.env.EXA_API_KEY?.trim()),
    libraryName: getSetting(LIBRARY_NAME_KEY) ?? "",
    slots: SLOTS.map((s) => {
      const saved = getSetting(settingKey(s.key));
      const env = process.env[s.env]?.trim();
      return { key: s.key, saved: saved ?? null, fromEnv: env || null, model: saved || envModel(s.key), fallback: s.fallback };
    }),
  });
}

/** `models`: a model id per slot, or null to go back to the environment's or the default. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { models?: Record<string, unknown>; libraryName?: unknown };
  for (const [slot, v] of Object.entries(body.models ?? {})) {
    if (!isSlot(slot)) return Response.json({ error: `Unknown model slot: ${slot}` }, { status: 400 });
    if (v === null || v === "") setSetting(settingKey(slot), null);
    else if (typeof v === "string" && v.length < 200 && MODEL_ID.test(v.trim())) setSetting(settingKey(slot), v.trim());
    else return Response.json({ error: "A model is named like vendor/model, as OpenRouter lists it." }, { status: 400 });
  }
  if (body.libraryName !== undefined) {
    const name = typeof body.libraryName === "string" ? body.libraryName.trim().slice(0, 60) : "";
    setSetting(LIBRARY_NAME_KEY, name || null);
  }
  return Response.json({ ok: true });
}
