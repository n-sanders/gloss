/**
 * Sorting a book onto the library's shelves, on the server: one small call
 * to the fast model with the title and the opening, which picks one of the
 * family's topics, a few tags, and a scene for a painted cover. Never in the
 * way of an import: a failure leaves the book in Unsorted.
 */

import { cleanTags, topicOf, UNSORTED, type Shelving, type Topic } from "./library";
import { EXCERPT_CHARS } from "./excerpt";
import { completeJSON } from "./openrouter";
import { modelFor } from "./model-config";
import { loadTopics } from "./topics-server";

export type ShelveInput = { title: string; author?: string; source?: string; dek?: string; excerpt?: string };

const system = (topics: Topic[]) => `You shelve books in a family's homeschool library: readings, and activities (websites for practice, games and quizzes).

Pick the one topic that fits best, by its key:
${topics
  .filter((t) => t.key !== UNSORTED)
  .map((t) => `- ${t.key}: ${t.name}${t.hint ? ` (${t.hint})` : ""}`)
  .join("\n")}

Then up to 3 tags: short lowercase words or phrases that say what it is about, more specific than the topic (e.g. "fractions", "dog breeds", "volcanoes").

Then a scene for a wordless book-cover illustration of the text: one concrete visual metaphor with people, objects or a place, under 30 words. No text, letters, numbers, logos or screens with writing. No real people's likenesses.

Reply with JSON only: {"topic": "<key>", "tags": ["..."], "scene": "..."}`;

export async function classify(
  input: ShelveInput,
  opts: { signal?: AbortSignal } = {}
): Promise<{ ok: true; shelving: Shelving; usd: number } | { ok: false; error: string; code?: "not_configured" }> {
  const lines = [
    `Title: ${input.title}`,
    input.author && `Author: ${input.author}`,
    input.source && `Source: ${input.source}`,
    input.dek && `Summary: ${input.dek}`,
    input.excerpt && `Opening:\n${input.excerpt.slice(0, EXCERPT_CHARS)}`,
  ].filter(Boolean);
  const topics = await loadTopics();
  const r = await completeJSON<{ topic?: unknown; tags?: unknown; scene?: unknown }>({
    model: modelFor("structured"),
    signal: opts.signal,
    maxTokens: 220,
    messages: [
      { role: "system", content: system(topics) },
      { role: "user", content: lines.join("\n") },
    ],
  });
  if (!r.ok) return r;
  const topic = topicOf(r.data.topic);
  const scene = typeof r.data.scene === "string" ? r.data.scene.replace(/\s+/g, " ").trim().slice(0, 300) : undefined;
  return { ok: true, shelving: { topic, tags: cleanTags(r.data.tags, topic), scene: scene || undefined }, usd: r.usage.costUsd };
}
