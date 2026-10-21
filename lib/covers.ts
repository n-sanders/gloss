"use client";

/**
 * Covers in the browser. Painted and uploaded covers both live on the server,
 * so every computer shows the same one; a book's `coverRev` changes when its
 * cover does, so a browser never shows an old picture from its cache.
 *
 * Painting is opt-in (each one is a call to an image model): with it on, any
 * sorted book without a cover gets one, a couple at a time.
 */

import { useStore, type LibraryItem } from "./store";

/** Where a book's own cover is: a server-kept one, or an image URL. Null for the page picture or the topic's plate. */
export function coverSrc(b: { id: string; cover?: string; coverRev?: number }): string | null {
  if (b.cover === "painted" || b.cover === "uploaded") return `/api/covers/${encodeURIComponent(b.id)}?v=${b.coverRev ?? 0}`;
  if (b.cover && /^(\/|https?:\/\/)/.test(b.cover)) return b.cover;
  return null;
}

export const serverKept = (cover?: string) => cover === "painted" || cover === "uploaded";

/** Paint a cover for a book, kept on the server under its id. "rest" means painting is not possible right now. */
export async function paintCover(id: string, scene: string, topic?: string): Promise<{ ok: true } | { ok: false; rest: boolean; error: string }> {
  try {
    const res = await fetch("/api/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, scene, topic }) });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, rest: res.status === 503 || res.status === 429, error: j.error ?? "Could not paint a cover." };
  } catch {
    return { ok: false, rest: false, error: "Could not reach the server." };
  }
}

/** Upload a picture as a book's cover. Null when it worked, or what went wrong. */
export async function putCover(id: string, file: Blob): Promise<string | null> {
  try {
    const res = await fetch(`/api/covers/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not upload that picture.";
  } catch {
    return "Could not reach the server.";
  }
}

export async function deleteCover(id: string): Promise<void> {
  await fetch(`/api/covers/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

/** Paint one shelved book's cover. "rest" means painting is not possible right now, so the queue should stop. */
async function paint(item: LibraryItem): Promise<"ok" | "rest" | "error"> {
  if (!item.scene) return "error";
  const r = await paintCover(item.id, item.scene, item.topic);
  if (!r.ok) return r.rest ? "rest" : "error";
  useStore.getState().shelve(item.id, { cover: "painted", coverRev: Date.now() });
  return "ok";
}

let painting = false;

/** Paint every sorted book that has no cover yet, until painting is not possible. */
export async function paintAll(items: LibraryItem[]): Promise<void> {
  if (painting) return;
  painting = true;
  try {
    // Two at a time: a picture can take from a few seconds to most of a minute.
    const taken = new Set<string>();
    let rest = false;
    const worker = async () => {
      for (;;) {
        const next = useStore.getState().library.find((x) => !x.cover && !x.image && x.scene && !taken.has(x.id) && items.some((i) => i.id === x.id));
        if (!next || rest) return;
        taken.add(next.id);
        if ((await paint(next)) === "rest") rest = true;
      }
    };
    await Promise.all([worker(), worker()]);
  } finally {
    painting = false;
  }
}
