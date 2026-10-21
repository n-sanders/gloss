/**
 * Family secrets kept in the settings table: the passphrase, the cookie
 * signing secret, and the API keys. A value saved in Settings wins. Otherwise
 * the environment variable is used, so an existing env file keeps working
 * until Settings saves over it.
 *
 * The first start, with neither source set, stores the passphrase "gloss" and
 * a random signing secret. API keys stay empty until someone pastes them.
 */

import { randomBytes } from "node:crypto";
import { db, getSetting, setSetting } from "./db";

export const DEFAULT_PASSPHRASE = "gloss";

const PASSPHRASE_KEY = "gate:passphrase";
const SECRET_KEY = "gate:secret";
const OPENROUTER_KEY = "openrouter:key";
const EXA_KEY = "exa:key";

function fromEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

/** The stored value, then the environment, then null. */
export function secret(dbKey: string, envName: string): string | null {
  const saved = getSetting(dbKey)?.trim();
  if (saved) return saved;
  return fromEnv(envName);
}

/**
 * secret(), and when both are empty, make() is stored. Two first requests
 * share one stored value: the insert does nothing if the other already wrote.
 * The environment is not copied in, so it stays the fallback until Settings writes.
 */
function ensureSecret(dbKey: string, envName: string, make: () => string): string {
  const found = secret(dbKey, envName);
  if (found) return found;
  const made = make();
  db().prepare("insert into settings (key, value) values (?, ?) on conflict (key) do nothing").run(dbKey, made);
  return getSetting(dbKey)?.trim() || made;
}

export const passphrase = () => ensureSecret(PASSPHRASE_KEY, "FAMILY_PASSPHRASE", () => DEFAULT_PASSPHRASE);

export const passphraseIsDefault = () => passphrase() === DEFAULT_PASSPHRASE;

export function setPassphrase(value: string): void {
  setSetting(PASSPHRASE_KEY, value.trim());
}

export const sessionSecret = () => ensureSecret(SECRET_KEY, "SESSION_SECRET", () => randomBytes(32).toString("base64url"));

export function rotateSessionSecret(): void {
  setSetting(SECRET_KEY, randomBytes(32).toString("base64url"));
}

export const openRouterKey = () => secret(OPENROUTER_KEY, "OPENROUTER_API_KEY");

export const exaKey = () => secret(EXA_KEY, "EXA_API_KEY");

export function setOpenRouterKey(value: string | null): void {
  setSetting(OPENROUTER_KEY, value?.trim() || null);
}

export function setExaKey(value: string | null): void {
  setSetting(EXA_KEY, value?.trim() || null);
}
