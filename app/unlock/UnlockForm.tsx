"use client";

import { useState } from "react";

export function UnlockForm({ next }: { next: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: value }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "Could not unlock. Try again.");
        setBusy(false);
        return;
      }
      // A full load, so the proxy sees the new cookie on every request from here on.
      window.location.replace(next);
    } catch {
      setError("Could not reach the library. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 flex flex-col gap-3">
      <label htmlFor="passphrase" className="sr-only">
        Passphrase
      </label>
      <input
        id="passphrase"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Passphrase"
        className="h-11 rounded-xl border border-rule bg-transparent px-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-rule-strong"
      />
      {error && (
        <p role="alert" className="text-[13.5px] text-rubric-text">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="h-11 rounded-full bg-ink text-[14px] font-medium text-bg transition-[opacity,transform] active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
