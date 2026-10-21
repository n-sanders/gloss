/**
 * A painted cover for one book, on the server: the scene the classifier
 * wrote, as a two-colour risograph print in its topic's inks, from the image
 * model chosen in Settings. The title is never in the prompt, or the model
 * letters it onto the picture.
 */

import { complete } from "./openrouter";
import { modelFor } from "./model-config";

export async function paintCover(req: { scene: string; inks: string; signal?: AbortSignal }): Promise<{ ok: true; image: Uint8Array; mime: string } | { ok: false; error: string; code?: "not_configured" }> {
  const prompt = `Make a square picture. Editorial risograph print. ${req.scene.replace(/\.?$/, ".")} Two-colour palette of ${req.inks} ink on warm cream paper filling the whole image, grain and halftone texture, mid-century children's book illustration, wordless, no lettering, no border.`;
  const r = await complete({ model: modelFor("image"), image: true, maxTokens: 1200, signal: req.signal, messages: [{ role: "user", content: prompt }] });
  if (!r.ok) return r;
  const m = r.images[0]?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return { ok: false, error: "The image model sent back no picture. Pick a model that makes images in Settings." };
  return { ok: true, image: Uint8Array.from(Buffer.from(m[2], "base64")), mime: m[1] };
}
