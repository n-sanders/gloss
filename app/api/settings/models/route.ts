import type { ModelOption } from "@/lib/models";
import { APP_UA } from "@/lib/openrouter";

export const runtime = "nodejs";

type Listed = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
};

const HOUR = 60 * 60_000;
let cache: { at: number; models: ModelOption[] } | null = null;

const perM = (v?: string) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 1e6 * 1000) / 1000 : undefined);

/** OpenRouter's model list, trimmed to what the Settings picker needs, kept for an hour. */
export async function GET() {
  if (cache && Date.now() - cache.at < HOUR) return Response.json({ models: cache.models });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { "User-Agent": APP_UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { data?: Listed[] };
    const models = (j.data ?? [])
      .filter((m) => typeof m.id === "string")
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        input: m.architecture?.input_modalities ?? ["text"],
        output: m.architecture?.output_modalities ?? ["text"],
        promptPerM: perM(m.pricing?.prompt),
        completionPerM: perM(m.pricing?.completion),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    cache = { at: Date.now(), models };
    return Response.json({ models });
  } catch {
    // Offline or OpenRouter is down: the picker still takes a typed model id.
    return Response.json({ models: cache?.models ?? [], error: "Could not load OpenRouter's model list." });
  }
}
