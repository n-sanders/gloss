"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { startSync } from "@/lib/sync";

/** Keeps the family shelf in step with the server on every page. Renders nothing. */
export function SyncAgent() {
  useEffect(() => {
    useStore.getState().hydrate();
    const s = startSync();
    return () => s.stop();
  }, []);
  return null;
}
