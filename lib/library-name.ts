"use client";

import { useSyncExternalStore } from "react";

/**
 * The library's name, as set in Settings for the whole family. Kept on this
 * computer too, so the shelf shows it at once and checks the server after.
 */
export const DEFAULT_LIBRARY_NAME = "Our Library";
const KEY = "gloss:library-name";

let name: string | null = null;
let fetched = false;
const listeners = new Set<() => void>();

function read(): string {
  if (name === null) {
    try {
      name = localStorage.getItem(KEY) ?? "";
    } catch {
      name = "";
    }
  }
  return name || DEFAULT_LIBRARY_NAME;
}

/** Use the name everywhere at once, and remember it for next time. */
export function setLibraryName(next: string) {
  name = next.trim();
  try {
    if (name) localStorage.setItem(KEY, name);
    else localStorage.removeItem(KEY);
  } catch {}
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!fetched) {
    fetched = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { libraryName?: string } | null) => {
        if (d && typeof d.libraryName === "string" && d.libraryName.trim() !== (name ?? "")) setLibraryName(d.libraryName);
      })
      .catch(() => {});
  }
  return () => void listeners.delete(l);
}

export function useLibraryName(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_LIBRARY_NAME);
}
