/**
 * Which model does what, and the wire types. Safe to import on the client: no
 * keys, no fetches. lib/openrouter.ts does the network side, and
 * lib/model-config.ts picks the model for each slot on the server.
 *
 * Every model is reached through OpenRouter, by its OpenRouter id
 * ("vendor/model"). Each slot is set, in order, by the family's Settings
 * (kept in SQLite), then an environment variable, then the default here.
 */

export type Slot = "chat" | "structured" | "vision" | "image";

export const SLOTS: { key: Slot; label: string; blurb: string; env: string; fallback: string; needs?: "image-in" | "image-out" }[] = [
  { key: "chat", label: "Answers", blurb: "Questions and notes in the margin while reading.", env: "OPENROUTER_MODEL_CHAT", fallback: "google/gemini-2.5-flash" },
  { key: "structured", label: "Sorting and summaries", blurb: "The whole-text gloss, and sorting new books onto topics.", env: "OPENROUTER_MODEL_STRUCTURED", fallback: "google/gemini-2.5-flash" },
  { key: "vision", label: "Reading scanned pages", blurb: "PDF pages that are pictures of text.", env: "OPENROUTER_MODEL_VISION", fallback: "google/gemini-2.5-flash", needs: "image-in" },
  { key: "image", label: "Painted covers", blurb: "A picture for a book's cover.", env: "OPENROUTER_MODEL_IMAGE", fallback: "google/gemini-2.5-flash-image", needs: "image-out" },
];

export const isSlot = (v: unknown): v is Slot => typeof v === "string" && SLOTS.some((s) => s.key === v);

/** A model from OpenRouter's list, as the Settings picker shows it. Prices in dollars per million tokens. */
export type ModelOption = { id: string; name: string; input: string[]; output: string[]; promptPerM?: number; completionPerM?: number };

/** Whether a model can do a slot's job. */
export function fitsSlot(m: ModelOption, needs?: "image-in" | "image-out"): boolean {
  if (needs === "image-out") return m.output.includes("image");
  if (needs === "image-in") return m.input.includes("image") && m.output.includes("text");
  return m.output.includes("text");
}

/**
 * What answers are asked for. There is one answering model, chosen in
 * Settings; the key stays on turns and briefs that older builds saved.
 */
export type ModelKey = "chat";
export const DEFAULT_MODEL: ModelKey = "chat";
export const MODELS: Record<ModelKey, { label: string }> = { chat: { label: "AI" } };
export const isModelKey = (v: unknown): v is ModelKey => v === "chat";
export const modelOf = (_v: unknown): ModelKey => DEFAULT_MODEL;

/** A model id as a short name for the margin: "google/gemini-2.5-flash" reads "gemini-2.5-flash". */
export const modelLabel = (id: string) => id.split("/").pop() || id;

export type Usage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  /** What OpenRouter billed, in dollars. */
  costUsd: number;
};

/** A web result an answer can cite as [n]. */
export type Source = { n: number; title: string; url: string; site: string; date?: string };

export type StreamEvent =
  | { type: "meta"; model: string }
  | { type: "searching" }
  /** The model asked for a tool (web search); the route runs it and asks again. Never sent to the browser. */
  | { type: "tool"; id: string; name: string; args: string }
  /** Drop what was written so far: a line before a tool call ("I'll look that up") that the real answer replaces. */
  | { type: "reset" }
  | { type: "sources"; sources: Source[] }
  | { type: "content"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; text: string };
