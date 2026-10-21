/**
 * OpenRouter client. Server-side only. Raw fetch, OpenAI-compatible SSE.
 *
 * - usage.include asks OpenRouter to report what each call cost, so the
 *   receipt in the margin is the bill, not a guess from a price table.
 * - Errors come back as JSON: surface error.message, not the raw body.
 * - Reasoning is asked for only where it helps (the brief), and never shown.
 */

import { modelLabel, type StreamEvent, type Usage } from "./models";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const APP_UA = "Gloss/0.2";

export type { StreamEvent, Usage } from "./models";

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

type WireUsage = { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } };

type Chunk = {
  choices?: { delta?: { content?: string; reasoning?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  usage?: WireUsage;
  error?: { message?: string };
};

export const NOT_CONFIGURED = "AI is not set up on this server. Add OPENROUTER_API_KEY to turn it on.";

function key(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": APP_UA,
    "X-Title": "Gloss",
    ...(process.env.NEXT_PUBLIC_SITE_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL } : {}),
  };
}

export const usageOf = (u?: WireUsage): Usage => ({
  promptTokens: u?.prompt_tokens ?? 0,
  cachedTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
  completionTokens: u?.completion_tokens ?? 0,
  costUsd: typeof u?.cost === "number" ? u.cost : 0,
});

function errorMessage(status: number, body: string): string {
  let msg = body.slice(0, 280);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === "string") msg = j.error;
    else if (j.error?.message) msg = j.error.message;
    else if (j.message) msg = j.message;
  } catch {
    /* not JSON */
  }
  if (status === 401) return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY.";
  if (status === 402) return "The OpenRouter account is out of credit.";
  if (status === 429) return "OpenRouter is rate limiting. Wait a moment and try again.";
  return `OpenRouter ${status}: ${msg}`;
}

export async function* streamChat(req: {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Tools the model may call; a call ends the stream with a "tool" event instead of an answer. */
  tools?: readonly unknown[];
  /** "none" sends the tools (a conversation that already used one needs them) but asks for an answer. */
  toolChoice?: "auto" | "none";
}): AsyncGenerator<StreamEvent> {
  const apiKey = key();
  if (!apiKey) {
    yield { type: "error", text: NOT_CONFIGURED };
    return;
  }

  yield { type: "meta", model: modelLabel(req.model) };

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: req.signal,
      headers: headers(apiKey),
      body: JSON.stringify({
        model: req.model,
        stream: true,
        usage: { include: true },
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxTokens ?? 900,
        messages: req.messages,
        ...(req.tools ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
      }),
    });
  } catch (e) {
    if (req.signal?.aborted) return;
    yield { type: "error", text: `Could not reach OpenRouter: ${String(e)}` };
    return;
  }

  if (!res.ok || !res.body) {
    yield { type: "error", text: errorMessage(res.status, await res.text().catch(() => "")) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;
  // A tool call arrives in pieces, by index: its id and name once, its arguments in fragments.
  const calls: { id: string; name: string; args: string }[] = [];

  const finish = (): StreamEvent => {
    if (calls[0]?.name) return { type: "tool", id: calls[0].id || "call_0", name: calls[0].name, args: calls[0].args };
    return !sawContent && sawReasoning ? { type: "error", text: `${modelLabel(req.model)} answered only in its reasoning. Try again.` } : { type: "done" };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      // OpenRouter sends ": OPENROUTER PROCESSING" comments while it waits; only data lines count.
      const line = frame.split("\n").find((l) => l.startsWith("data:"))?.trim();
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        yield finish();
        return;
      }
      let chunk: Chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error?.message) {
        yield { type: "error", text: chunk.error.message };
        return;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning) sawReasoning = true;
      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (delta?.content) {
        sawContent = true;
        yield { type: "content", text: delta.content };
      }
      if (chunk.usage && typeof chunk.usage.completion_tokens === "number") yield { type: "usage", usage: usageOf(chunk.usage) };
    }
  }
  yield finish();
}

/** One completion, not streamed: its text and what it cost. */
export async function complete(req: {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Let the model reason before it answers. Its thinking spends from maxTokens and is never shown. */
  thinking?: boolean;
  json?: boolean;
  /** Ask for a picture back, for models that make them. */
  image?: boolean;
}): Promise<{ ok: true; text: string; images: string[]; usage: Usage } | { ok: false; error: string; code?: "not_configured" }> {
  const apiKey = key();
  if (!apiKey) return { ok: false, error: NOT_CONFIGURED, code: "not_configured" };

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: req.signal,
      headers: headers(apiKey),
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature ?? 0.3,
        max_tokens: req.maxTokens ?? 1400,
        usage: { include: true },
        messages: req.messages,
        ...(req.thinking ? { reasoning: { effort: "medium", exclude: true } } : {}),
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
        ...(req.image ? { modalities: ["image", "text"] } : {}),
      }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach OpenRouter: ${String(e)}` };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, error: errorMessage(res.status, body) };
  try {
    const j = JSON.parse(body) as {
      choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[];
      usage?: WireUsage;
      error?: { message?: string };
    };
    if (j.error?.message) return { ok: false, error: j.error.message };
    const m = j.choices?.[0]?.message;
    const images = (m?.images ?? []).map((i) => i.image_url?.url ?? "").filter(Boolean);
    return { ok: true, text: m?.content ?? "", images, usage: usageOf(j.usage) };
  } catch {
    return { ok: false, error: "OpenRouter sent back something that was not JSON." };
  }
}

/** A completion whose answer is a JSON object, for structured output like the brief. */
export async function completeJSON<T>(req: {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  signal?: AbortSignal;
  thinking?: boolean;
}): Promise<{ ok: true; data: T; usage: Usage } | { ok: false; error: string; code?: "not_configured" }> {
  const r = await complete({ ...req, json: true });
  if (!r.ok) return r;
  try {
    const raw = r.text;
    const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as T;
    return { ok: true, data, usage: r.usage };
  } catch {
    return { ok: false, error: "The model returned something that was not valid JSON. Try again." };
  }
}
