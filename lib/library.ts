/**
 * The library: every book on the shelf, shelved by topic. The topics are the
 * family's own (kept in SQLite and synced like the shelf); each has one cloth
 * colour, from which four shades are made so its books look like a set, and
 * an emoji. Books get their spine, height and colour from their id, so the
 * same book always looks the same.
 *
 * Shared by the client (the shelves) and the server (the classifier and the
 * agent server): no React, no store, no fetches. `TOPICS` and `TOPIC` are
 * filled in place by setTopics, so every importer sees the current list.
 */

export type TopicKey = string;

/** A topic as it is stored and synced. */
export type TopicRow = {
  key: string;
  name: string;
  /** The cloth colour, as #rrggbb. */
  color: string;
  emoji: string;
  /** What belongs here, for the classifier. */
  hint?: string;
  /** A line under the topic's name. */
  blurb?: string;
  /** Where it stands among the others. */
  sort: number;
};

export type Topic = TopicRow & {
  /** Cloth shades: [base, light, deep, pale]. */
  shades: [string, string, string, string];
  /** The two inks, for a painted cover in this topic. */
  inks: string;
};

export const UNSORTED = "unsorted";

export const DEFAULT_TOPICS: TopicRow[] = [
  { key: "math", name: "Math", color: "#2f6db5", emoji: "🔢", hint: "arithmetic, numbers, fractions, geometry, measurement, logic puzzles, math games", blurb: "Numbers, shapes and puzzles." },
  { key: "reading", name: "Reading", color: "#8a4fb0", emoji: "📚", hint: "phonics, reading practice, stories, picture books, comprehension, literature", blurb: "Stories and the practice of reading them." },
  { key: "writing", name: "Writing", color: "#c0603a", emoji: "✏️", hint: "handwriting, spelling, grammar, typing, composition, poetry", blurb: "Letters, words and sentences." },
  { key: "science", name: "Science", color: "#2c8a7a", emoji: "🔬", hint: "physics, chemistry, experiments, space, weather, the human body, how things work", blurb: "How the world works, and how we find out." },
  { key: "nature", name: "Nature and Animals", color: "#4f8a3a", emoji: "🐾", hint: "animals, dogs, birds, insects, plants, trees, ecology, the outdoors, identification", blurb: "Creatures, plants and the outdoors." },
  { key: "history", name: "History", color: "#8c5a2b", emoji: "🏛️", hint: "history, past civilizations, famous people, timelines, how things came to be", blurb: "How we got here." },
  { key: "geography", name: "Geography", color: "#2a7aa8", emoji: "🌍", hint: "maps, countries, flags, capitals, continents, oceans, cultures around the world", blurb: "Places, maps and people around the world." },
  { key: "art", name: "Art", color: "#c4447e", emoji: "🎨", hint: "drawing, painting, crafts, famous artists, color, design", blurb: "Making things, and looking closely." },
  { key: "music", name: "Music", color: "#5b4a9e", emoji: "🎵", hint: "songs, instruments, rhythm, reading music, composers", blurb: "Songs, rhythm and instruments." },
  { key: "coding", name: "Coding", color: "#3d4a5c", emoji: "💻", hint: "programming, computers, logic, robots, typing games, scratch", blurb: "Telling computers what to do." },
  { key: "languages", name: "Languages", color: "#b0841f", emoji: "🗣️", hint: "foreign languages, vocabulary, sign language, words from other languages", blurb: "Words from other places." },
  { key: "life", name: "Life Skills", color: "#7a6a2a", emoji: "🧺", hint: "cooking, money, time, chores, health, safety, manners, first aid", blurb: "Everyday things worth knowing." },
  { key: UNSORTED, name: "Unsorted", color: "#6b675f", emoji: "📦", hint: "", blurb: "Not shelved yet." },
].map((t, i) => ({ ...t, sort: i }));

/** Exact hints from before the American spelling. An edited hint is left alone. */
const BRITISH_HINTS: Record<string, string> = {
  "history, past civilisations, famous people, timelines, how things came to be": "history, past civilizations, famous people, timelines, how things came to be",
  "drawing, painting, crafts, famous artists, colour, design": "drawing, painting, crafts, famous artists, color, design",
};

export function spellTopics(rows: TopicRow[]): TopicRow[] {
  return rows.map((row) => {
    const hint = row.hint && BRITISH_HINTS[row.hint];
    return hint ? { ...row, hint } : row;
  });
}

/* ---------- colour ---------- */

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hexOf = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Part of the way from one colour to another. */
const mix = (a: string, b: string, t: number) => {
  const x = rgbOf(a), y = rgbOf(b);
  return hexOf(x.map((v, i) => v + (y[i] - v) * t));
};

/** A topic's four cloths from its one colour: itself, a lighter, a deeper, and a pale one. */
export function shadesOf(color: string): [string, string, string, string] {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#6b675f";
  return [base, mix(base, "#ffffff", 0.2), mix(base, "#000000", 0.3), mix(base, "#ffffff", 0.55)];
}

function topicFrom(r: TopicRow): Topic {
  const shades = shadesOf(r.color);
  return { ...r, shades, inks: `${shades[2]} and ${shades[3]}` };
}

export const TOPICS: Topic[] = [];
export const TOPIC: Record<TopicKey, Topic> = {};

/** Replace the current topics. Unsorted is always there, and always last. */
export function setTopics(rows: TopicRow[]) {
  const list = rows.filter((r) => r.key && r.key !== UNSORTED).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const unsorted = rows.find((r) => r.key === UNSORTED) ?? DEFAULT_TOPICS.find((r) => r.key === UNSORTED)!;
  const all = [...list, unsorted].map(topicFrom);
  TOPICS.splice(0, TOPICS.length, ...all);
  for (const k of Object.keys(TOPIC)) delete TOPIC[k];
  for (const t of all) TOPIC[t.key] = t;
  looks.clear();
}

/** A topic's key, from its name: lowercase words joined by dashes, unique among `taken`. */
export function topicKeyFor(name: string, taken: string[]): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "topic";
  let key = base;
  // A tag's key is taken too: the same glyph names both.
  for (let i = 2; taken.includes(key) || isTag(key); i++) key = `${base}-${i}`;
  return key;
}

export const isTopic = (v: unknown): v is TopicKey => typeof v === "string" && Object.hasOwn(TOPIC, v);
export const topicOf = (v: unknown): TopicKey => (isTopic(v) ? v : UNSORTED);

/** One text as the shelves see it: the shelf entry, with your reading laid over it. */
export type Book = {
  id: string;
  /** Read here in the app, or an activity: a link out to another site. */
  kind: "reading" | "activity";
  title: string;
  author: string;
  year?: number;
  url?: string;
  topic: TopicKey;
  minutes: number;
  dek?: string;
  tags: string[];
  favorite: boolean;
  /** 0 to 1. */
  pct: number;
  highlights: number;
  added: number;
  finished?: number;
  /** The page's own picture, shown duotone. */
  image?: string;
  /** Its cover: an image URL, or "painted" / "uploaded" for one kept on the server. */
  cover?: string;
  coverRev?: number;
  /** A cloth colour chosen by hand. */
  color?: string;
  /** An activity: when it was last opened on this computer. */
  opened?: number;
  /** Saved by an agent rather than by hand. */
  agent: boolean;
};

/* ---------- looks ---------- */

/** FNV-1a, then a small PRNG: the same id always gives the same book. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SpineStyle = "bands" | "label" | "sans" | "foil";

export type Look = {
  color: string;
  /** Text and rules on the cloth. */
  fg: string;
  light: boolean;
  style: SpineStyle;
  w: number;
  h: number;
  hue: number;
};

const STYLES: SpineStyle[] = ["bands", "label", "sans", "foil"];

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hueOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return 400 + luminance(hex) * 100; // greys after the rainbow
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360 + 20) % 360; // start the rainbow at red
}

const looks = new Map<string, Look>();

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Activities have no length to read, so they all stand at one width. */
const ACTIVITY_W = 50;

export function lookOf(b: Pick<Book, "id" | "topic" | "minutes"> & { kind?: Book["kind"]; color?: string }): Look {
  const key = `${b.id}:${b.topic}:${b.minutes}:${b.kind ?? ""}:${b.color ?? ""}`;
  const hit = looks.get(key);
  if (hit) return hit;
  const r = rng(hash(b.id));
  const shades = TOPIC[topicOf(b.topic)].shades;
  // Mostly the base and deep cloths; the light and pale ones now and then, for rhythm.
  const pick = r();
  const color = isHex(b.color) ? b.color.toLowerCase() : shades[pick < 0.38 ? 0 : pick < 0.7 ? 2 : pick < 0.88 ? 1 : 3];
  const light = luminance(color) > 0.3;
  const look: Look = {
    color,
    fg: light ? "#2a2520" : "#f6efe2",
    light,
    style: STYLES[Math.floor(r() * STYLES.length)],
    w: b.kind === "activity" ? ACTIVITY_W : Math.round(Math.min(74, Math.max(30, 22 + Math.sqrt(b.minutes) * 4.8))),
    h: Math.round(204 + r() * 54),
    hue: hueOf(color),
  };
  looks.set(key, look);
  return look;
}

/* ---------- shelving ---------- */

export type Sort = "topic" | "recent" | "color" | "length";

export const SORTS: { key: Sort; label: string }[] = [
  { key: "topic", label: "Topic" },
  { key: "recent", label: "Recent" },
  { key: "color", label: "Color" },
  { key: "length", label: "Length" },
];

export function sortBooks(books: Book[], sort: Sort): Book[] {
  const by = [...books];
  const order = new Map(TOPICS.map((t, i) => [t.key, i]));
  const at = (k: TopicKey) => order.get(k) ?? TOPICS.length;
  if (sort === "topic") by.sort((a, b) => at(a.topic) - at(b.topic) || a.added - b.added);
  if (sort === "recent") by.sort((a, b) => b.added - a.added);
  if (sort === "color") by.sort((a, b) => lookOf(a).hue - lookOf(b).hue || lookOf(a).h - lookOf(b).h);
  // Activities first, then readings from shortest to longest.
  if (sort === "length") by.sort((a, b) => Number(a.kind !== "activity") - Number(b.kind !== "activity") || a.minutes - b.minutes);
  return by;
}

/** The label on the shelf under the first book of each run: a topic, a month or a length. */
export function groupOf(b: Book, sort: Sort): { key: string; label: string; icon?: TopicKey | TagKey } | null {
  if (sort === "topic") return { key: b.topic, label: TOPIC[topicOf(b.topic)].name, icon: topicOf(b.topic) };
  if (sort === "recent") {
    const label = new Date(b.added).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { key: label, label };
  }
  if (sort === "length") {
    if (b.kind === "activity") return { key: "activities", label: "Activities" };
    if (b.minutes < 10) return { key: "quick", label: "Under 10 min", icon: "quick" };
    if (b.minutes < 30) return { key: "sitting", label: "One sitting" };
    return { key: "long", label: b.minutes < 60 ? "An evening" : "A weekend", icon: "long" };
  }
  return null;
}

/* ---------- tags you can filter by ---------- */

export type TagKey = "favorite" | "now" | "finished" | "quick" | "long" | "agent";

export const TAGS: { key: TagKey; label: string; test: (b: Book) => boolean }[] = [
  { key: "now", label: "Reading now", test: (b) => b.pct > 0 && b.pct < 1 },
  { key: "favorite", label: "Favorites", test: (b) => b.favorite },
  { key: "finished", label: "Finished", test: (b) => b.pct >= 1 },
  { key: "quick", label: "Under 10 min", test: (b) => b.kind === "reading" && b.minutes < 10 },
  { key: "long", label: "Long reads", test: (b) => b.kind === "reading" && b.minutes >= 45 },
  { key: "agent", label: "Added by an agent", test: (b) => b.agent },
];

/** The tags' own emoji, beside the topics'. */
export const TAG_EMOJI: Record<TagKey, string> = { favorite: "⭐", now: "📖", finished: "✅", quick: "⚡", long: "🌙", agent: "🤖" };

export const isTag = (k: string): k is TagKey => Object.hasOwn(TAG_EMOJI, k);

export const tagsOf = (b: Book) => TAGS.filter((t) => t.key !== "agent" && t.test(b));

export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

export const hostOf = (url?: string) => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/** A year from what an importer found ("2019", an ISO date), when it is a plausible one. */
export function yearOf(published?: string): number | undefined {
  const y = Number(published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]);
  return y && y <= new Date().getFullYear() + 1 ? y : undefined;
}

/* ---------- what the classifier returns ---------- */

export type Shelving = { topic: TopicKey; tags: string[]; scene?: string };

/** Tags: a few short lowercase words, never the topic's own name. */
export function cleanTags(v: unknown, topic: TopicKey): string[] {
  if (!Array.isArray(v)) return [];
  const name = (TOPIC[topic]?.name ?? "").toLowerCase();
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string") continue;
    const s = t.toLowerCase().replace(/[^a-z0-9 &+.-]/g, "").replace(/\s+/g, " ").trim();
    if (s.length > 32) continue;
    if (s && s !== name && !out.includes(s)) out.push(s);
    if (out.length === 3) break;
  }
  return out;
}

// The built-in topics until the family's own arrive (from localStorage, the server, or the database).
setTopics(DEFAULT_TOPICS);
