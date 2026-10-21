"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { TopBar } from "@/components/ui/TopBar";
import { DEFAULT_LIBRARY_NAME, setLibraryName } from "@/lib/library-name";
import { SLOTS, fitsSlot, type ModelOption, type Slot } from "@/lib/models";
import { TopicManager } from "./TopicManager";

type SlotState = { key: Slot; saved: string | null; fromEnv: string | null; model: string; fallback: string };
type Loaded = { ai: boolean; search: boolean; libraryName: string; slots: SlotState[] };

async function put(body: object): Promise<string | null> {
  try {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save.";
  } catch {
    return "Could not reach the server.";
  }
}

/** The family's settings, shared by every computer: the library's name, its topics, and which model does each job. */
export function SettingsPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [listNote, setListNote] = useState<string | null>(null);

  const load = () =>
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Loaded) => setData(j))
      .catch(() => setFailed(true));

  useEffect(() => {
    void load();
    fetch("/api/settings/models")
      .then((r) => r.json())
      .then((j: { models?: ModelOption[]; error?: string }) => {
        setModels(j.models ?? []);
        if (j.error) setListNote(`${j.error} You can still type a model id.`);
      })
      .catch(() => setListNote("Could not load OpenRouter's model list. You can still type a model id."));
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <TopBar here="settings" />
      <main className="mx-auto w-full max-w-[720px] px-5 pb-24 pt-8 sm:px-8">
        <h1 className="font-serif text-[34px] leading-tight tracking-[-0.015em]">Settings</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">These are shared by every computer in the house. Reading settings (type, theme, highlighter) stay on each computer, in the reader&rsquo;s menu.</p>

        {failed && <p className="mt-8 text-[14px] text-rubric-text">Could not load the settings. Reload to try again.</p>}
        {!data && !failed && <Loader2 size={18} className="mt-10 animate-spin text-ink-3" />}

        {data && (
          <>
            <Section title="The library">
              <LibraryName initial={data.libraryName} />
            </Section>

            <Section title="Topics">
              <TopicManager />
            </Section>

            <Section title="AI">
              <Status ok={data.ai} yes="OpenRouter is connected." no="No OpenRouter key: set OPENROUTER_API_KEY on the server to turn on answers, sorting and painted covers." />
              <Status ok={data.search} yes="Web search (Exa) is on for answers." no="Web search is off: set EXA_API_KEY to let answers look things up." />
              <p className="mt-6 text-[13.5px] leading-relaxed text-ink-3">
                Each job uses a model from{" "}
                <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
                  OpenRouter
                </a>
                . Leave one unset to use the server&rsquo;s choice.
              </p>
              {listNote && <p className="mt-2 text-[12.5px] text-ink-3">{listNote}</p>}
              <div className="mt-4 divide-y divide-rule border-y border-rule">
                {data.slots.map((s) => (
                  <SlotRow key={s.key} slot={s} models={models} onSaved={load} />
                ))}
              </div>
            </Section>

            <Section title="Agents">
              <p className="text-[14px] leading-relaxed text-ink-2">
                Agents like Claude or Grok can save books through Gloss&rsquo;s MCP server. Make or revoke a connection from the shelf: <span className="font-medium text-ink">Add</span>, then <span className="font-medium text-ink">Agent</span>.
              </p>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="lib-label">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <p className="mt-1.5 flex items-start gap-2 text-[14px] leading-relaxed">
      <span aria-hidden className={`mt-[7px] size-2 shrink-0 rounded-full ${ok ? "bg-[#4f9a55]" : "bg-ink-4"}`} />
      <span className={ok ? "text-ink-2" : "text-ink-3"}>{ok ? yes : no}</span>
    </p>
  );
}

function LibraryName({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const e = await put({ libraryName: value });
    setErr(e);
    if (!e) {
      setSaved(value.trim());
      setLibraryName(value);
    }
  };
  return (
    <div>
      <label htmlFor="libname" className="text-[14px] text-ink-2">
        What the shelf is called
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="libname"
          value={value}
          maxLength={60}
          placeholder={DEFAULT_LIBRARY_NAME}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-rule bg-transparent px-3.5 text-[14.5px] outline-none placeholder:text-ink-4 focus:border-rule-strong"
        />
        <button type="button" className="add-btn" disabled={value.trim() === saved} onClick={() => void save()}>
          {value.trim() === saved && saved ? <Check size={14} /> : null}
          {value.trim() === saved && saved ? "Saved" : "Save"}
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-rubric-text">{err}</p>}
    </div>
  );
}

const price = (m?: ModelOption) =>
  m && m.promptPerM !== undefined && m.completionPerM !== undefined ? `$${m.promptPerM} in, $${m.completionPerM} out per million tokens` : null;

function SlotRow({ slot, models, onSaved }: { slot: SlotState; models: ModelOption[]; onSaved: () => void }) {
  const meta = SLOTS.find((s) => s.key === slot.key)!;
  const [value, setValue] = useState(slot.saved ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fits = useMemo(() => models.filter((m) => fitsSlot(m, meta.needs)), [models, meta.needs]);
  const chosen = models.find((m) => m.id === slot.model);
  const listId = `models-${slot.key}`;
  const serverChoice = slot.fromEnv ?? slot.fallback;
  const dirty = value.trim() !== (slot.saved ?? "");

  const save = async (v: string | null) => {
    setBusy(true);
    const e = await put({ models: { [slot.key]: v } });
    setBusy(false);
    setErr(e);
    if (!e) {
      if (v === null) setValue("");
      onSaved();
    }
  };

  return (
    <div className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] font-medium text-ink">{meta.label}</p>
        <p className="text-[12.5px] text-ink-3">
          {slot.saved ? "Chosen here" : slot.fromEnv ? `From ${meta.env}` : "Built-in default"}: <span className="font-mono text-ink-2">{slot.model}</span>
        </p>
      </div>
      <p className="mt-1 text-[13px] text-ink-3">{meta.blurb}</p>
      <div className="mt-3 flex gap-2">
        <input
          list={listId}
          value={value}
          spellCheck={false}
          placeholder={serverChoice}
          aria-label={`${meta.label} model`}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && void save(value.trim() || null)}
          className="h-10 min-w-0 flex-1 rounded-xl border border-rule bg-transparent px-3.5 font-mono text-[13px] outline-none placeholder:text-ink-4 focus:border-rule-strong"
        />
        <datalist id={listId}>
          {fits.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
        <button type="button" className="add-btn" disabled={busy || !dirty} onClick={() => void save(value.trim() || null)}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save
        </button>
        {slot.saved && (
          <button type="button" aria-label="Use the server's choice" data-tip="Use the server's choice" disabled={busy} onClick={() => void save(null)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <RotateCcw size={15} />
          </button>
        )}
      </div>
      {price(chosen) && <p className="mt-2 text-[12px] text-ink-3">{price(chosen)}</p>}
      {meta.needs && <p className="mt-1 text-[12px] text-ink-4">{meta.needs === "image-out" ? "Only models that make pictures are listed." : "Only models that can see pictures are listed."}</p>}
      {err && <p className="mt-2 text-[12.5px] text-rubric-text">{err}</p>}
    </div>
  );
}
