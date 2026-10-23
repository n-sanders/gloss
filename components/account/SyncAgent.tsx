"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { startSync } from "@/lib/sync";

/** Keeps the family shelf in step with the server on every page. Renders nothing. */
export function SyncAgent() {
  useEffect(() => {
    useStore.getState().hydrate();
    // The unlock page has no cookie yet. Syncing there always 401s, and the
    // recovery navigation reloads this same page.
    if (location.pathname === "/unlock") return;
    const s = startSync();
    return () => s.stop();
  }, []);
  return null;
}
