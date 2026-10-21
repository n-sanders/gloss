/**
 * The family's topics on the server: seeded once with the homeschool
 * defaults, then whatever the family has made of them in Settings.
 */

import { getSetting, seedTopics, setSetting, topicRows } from "./db";
import { DEFAULT_TOPICS, setTopics, TOPICS, type Topic, type TopicRow } from "./library";

const SEEDED = "topics:seeded";

/** Put the default topics in the database the first time it is used. Deleted ones stay deleted. */
export async function ensureTopics(): Promise<void> {
  if (getSetting(SEEDED)) return;
  await seedTopics(DEFAULT_TOPICS.map((t) => ({ id: t.key, data: t })));
  setSetting(SEEDED, "1");
}

export function rowOf(id: string, d: Record<string, unknown>): TopicRow | null {
  if (typeof d.name !== "string" || !d.name.trim()) return null;
  return {
    key: id,
    name: d.name,
    color: typeof d.color === "string" ? d.color : "#6b675f",
    emoji: typeof d.emoji === "string" ? d.emoji : "📘",
    hint: typeof d.hint === "string" ? d.hint : undefined,
    blurb: typeof d.blurb === "string" ? d.blurb : undefined,
    sort: Number(d.sort) || 0,
  };
}

/** The current topics, read from the database into the shared registry. */
export async function loadTopics(): Promise<Topic[]> {
  try {
    await ensureTopics();
    const rows = (await topicRows()).flatMap((r) => rowOf(r.id, r.data) ?? []);
    if (rows.length) setTopics(rows);
  } catch {
    // No database: the built-in topics stand in.
  }
  return TOPICS;
}
