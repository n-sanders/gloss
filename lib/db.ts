/**
 * SQLite, in one file on disk, through Node's built-in driver. One family, so
 * no table is keyed by user. Server-side only.
 *
 * The file lives in DATA_DIR (./data by default, /data in the container). The
 * schema is created the first time the file is opened; there is no migrate step.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
-- Every synced table has the same shape so one sync route serves them all:
-- the client's object as JSON, never hard-deleted by the app (a tombstone tells other computers).
create table if not exists articles (
  id text primary key,
  data text not null,           -- the shelf entry: title, author, words, origin
  doc text,                     -- the full text; null for activities and tombstones
  deleted integer not null default 0,
  updated_at text not null
);
create index if not exists articles_updated on articles (updated_at);

create table if not exists topics (
  id text primary key,
  data text not null,           -- name, color, emoji, hint, sort
  deleted integer not null default 0,
  updated_at text not null
);
create index if not exists topics_updated on topics (updated_at);

-- Covers for books: painted by an image model, or uploaded by hand.
create table if not exists covers (
  id text primary key,          -- the book id
  image blob not null,
  mime text not null default 'image/jpeg',
  created_at text not null
);

-- Tokens that let an agent (Claude, Grok Bot, ...) save to the shelf through /mcp.
-- Only a hash of each token is kept; the token itself is shown once, when it is made.
create table if not exists agent_tokens (
  id text primary key,
  hash text not null unique,
  label text not null default '',
  created_at text not null,
  last_used_at text,
  revoked integer not null default 0
);

-- Small key/value settings shared by the family: model choices, the library's name.
create table if not exists settings (
  key text primary key,
  value text not null
);
`;

let client: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!client) {
    const dir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "data");
    mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(path.join(dir, "gloss.db"));
    d.exec("pragma journal_mode = wal; pragma synchronous = normal; pragma busy_timeout = 5000;");
    d.exec(SCHEMA);
    client = d;
  }
  return client;
}

/** The time a row changed, as ISO text: it sorts as it reads, and the client pulls with the same format. */
const now = () => new Date().toISOString();

function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("begin immediate");
  try {
    const out = fn();
    d.exec("commit");
    return out;
  } catch (e) {
    d.exec("rollback");
    throw e;
  }
}

const parse = (s: unknown): unknown => {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** The tables the sync route reads and writes. Names are only ever taken from this list. */
export const COLLECTIONS = ["articles", "topics"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const isCollection = (v: unknown): v is Collection => typeof v === "string" && (COLLECTIONS as readonly string[]).includes(v);

export type PushRow = { id: string; data: unknown; deleted: boolean; doc?: unknown };
export type PullRow = { id: string; articleId: string; data: unknown; deleted: boolean };

/** Rows changed since `since` in every collection, tombstones included, plus the clock to pull from next time. */
export async function pullRows(since: string): Promise<{ now: string; changes: Record<Collection, PullRow[]> }> {
  const clock = now();
  const changes = Object.fromEntries(
    COLLECTIONS.map((t) => [
      t,
      db()
        .prepare(`select id, data, deleted from ${t} where updated_at > ? order by updated_at`)
        .all(since)
        .map((r) => ({ id: String(r.id), articleId: String(r.id), data: r.deleted ? null : parse(r.data), deleted: Boolean(r.deleted) })),
    ])
  ) as Record<Collection, PullRow[]>;
  return { now: clock, changes };
}

/** Upsert every collection's rows in one transaction. The server stamps the time, so the latest write wins. */
export async function pushRows(changes: Partial<Record<Collection, PushRow[]>>): Promise<void> {
  tx(() => {
    const d = db();
    const article = d.prepare(
      `insert into articles (id, data, doc, deleted, updated_at) values (?, ?, ?, ?, ?)
       on conflict (id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
         doc = case when excluded.deleted then null else coalesce(excluded.doc, articles.doc) end`
    );
    const topic = d.prepare(
      `insert into topics (id, data, deleted, updated_at) values (?, ?, ?, ?)
       on conflict (id) do update set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at`
    );
    const dropCover = d.prepare("delete from covers where id = ?");
    for (const r of changes.articles ?? []) {
      article.run(r.id, JSON.stringify(r.data ?? {}), r.deleted || r.doc == null ? null : JSON.stringify(r.doc), r.deleted ? 1 : 0, now());
      // A book taken off the shelf takes its cover with it.
      if (r.deleted) dropCover.run(r.id);
    }
    for (const r of changes.topics ?? []) topic.run(r.id, JSON.stringify(r.data ?? {}), r.deleted ? 1 : 0, now());
  });
}

/** One article's full text. */
export async function articleDoc(id: string): Promise<unknown | null> {
  const r = db().prepare("select doc from articles where id = ? and not deleted and doc is not null").get(id);
  return r ? parse(r.doc) : null;
}

/* ---------- covers ---------- */

export async function saveCover(id: string, image: Uint8Array, mime = "image/jpeg"): Promise<void> {
  db()
    .prepare(
      `insert into covers (id, image, mime, created_at) values (?, ?, ?, ?)
       on conflict (id) do update set image = excluded.image, mime = excluded.mime, created_at = excluded.created_at`
    )
    .run(id, image, mime, now());
}

export async function loadCover(id: string): Promise<{ image: Uint8Array; mime: string } | null> {
  const r = db().prepare("select image, mime from covers where id = ?").get(id);
  return r ? { image: r.image as Uint8Array, mime: String(r.mime) } : null;
}

export async function deleteCover(id: string): Promise<void> {
  db().prepare("delete from covers where id = ?").run(id);
}

/* ---------- agent tokens ---------- */

export type AgentToken = { id: string; label: string; createdAt: string; lastUsedAt: string | null };

export async function createToken(id: string, hash: string, label: string): Promise<void> {
  db().prepare("insert into agent_tokens (id, hash, label, created_at) values (?, ?, ?, ?)").run(id, hash, label, now());
}

export async function listTokens(): Promise<AgentToken[]> {
  return db()
    .prepare("select id, label, created_at, last_used_at from agent_tokens where not revoked order by created_at desc")
    .all()
    .map((r) => ({ id: String(r.id), label: String(r.label), createdAt: String(r.created_at), lastUsedAt: r.last_used_at ? String(r.last_used_at) : null }));
}

export async function revokeToken(id: string): Promise<boolean> {
  return Number(db().prepare("update agent_tokens set revoked = 1 where id = ? and not revoked").run(id).changes) > 0;
}

/** The connection a token belongs to, noting that it was used. Null for an unknown or revoked token. */
export async function tokenLabel(hash: string): Promise<{ label: string } | null> {
  const d = db();
  const r = d.prepare("select id, label from agent_tokens where hash = ? and not revoked").get(hash);
  if (!r) return null;
  d.prepare("update agent_tokens set last_used_at = ? where id = ?").run(now(), String(r.id));
  return { label: String(r.label ?? "") };
}

/* ---------- the shelf, for an agent ---------- */

export type ShelfRow = { id: string; data: Record<string, unknown> };

/** Every book on the shelf, newest first. */
export async function shelf(): Promise<ShelfRow[]> {
  return db()
    .prepare("select id, data from articles where not deleted order by updated_at desc")
    .all()
    .map((r) => ({ id: String(r.id), data: (parse(r.data) ?? {}) as Record<string, unknown> }));
}

/** Put one book on the shelf, as a browser would: the next sync brings it down. */
export async function shelve(item: { id: string }, doc: unknown | null): Promise<void> {
  db()
    .prepare(
      `insert into articles (id, data, doc, deleted, updated_at) values (?, ?, ?, 0, ?)
       on conflict (id) do update set data = excluded.data, doc = excluded.doc, deleted = 0, updated_at = excluded.updated_at`
    )
    .run(item.id, JSON.stringify(item), doc == null ? null : JSON.stringify(doc), now());
}

/** The topics on the server, live ones only. */
export async function topicRows(): Promise<{ id: string; data: Record<string, unknown> }[]> {
  return db()
    .prepare("select id, data from topics where not deleted")
    .all()
    .map((r) => ({ id: String(r.id), data: (parse(r.data) ?? {}) as Record<string, unknown> }));
}

/** Add topics that have never existed on the server (not even as tombstones). Returns how many were added. */
export async function seedTopics(rows: { id: string; data: unknown }[]): Promise<number> {
  return tx(() => {
    const st = db().prepare("insert into topics (id, data, deleted, updated_at) values (?, ?, 0, ?) on conflict (id) do nothing");
    let n = 0;
    for (const r of rows) n += Number(st.run(r.id, JSON.stringify(r.data), now()).changes);
    return n;
  });
}

/* ---------- settings ---------- */

export function getSetting(key: string): string | null {
  const r = db().prepare("select value from settings where key = ?").get(key);
  return r ? String(r.value) : null;
}

export function allSettings(): Record<string, string> {
  return Object.fromEntries(db().prepare("select key, value from settings").all().map((r) => [String(r.key), String(r.value)]));
}

export function setSetting(key: string, value: string | null): void {
  if (value === null || value === "") db().prepare("delete from settings where key = ?").run(key);
  else db().prepare("insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value").run(key, value);
}
