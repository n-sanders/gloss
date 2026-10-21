/**
 * The model for each slot, on the server: the family's choice in Settings,
 * then the environment, then the built-in default.
 */

import { getSetting } from "./db";
import { SLOTS, type Slot } from "./models";

export const settingKey = (slot: Slot) => `model:${slot}`;
export const LIBRARY_NAME_KEY = "library:name";

export function envModel(slot: Slot): string {
  const s = SLOTS.find((x) => x.key === slot)!;
  return process.env[s.env]?.trim() || s.fallback;
}

export function modelFor(slot: Slot): string {
  let saved: string | null = null;
  try {
    saved = getSetting(settingKey(slot));
  } catch {
    // No database to read: the environment still decides.
  }
  return saved?.trim() || envModel(slot);
}

export const aiConfigured = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());
