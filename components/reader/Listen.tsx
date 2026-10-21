"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { Headphones, Pause, Play, Square } from "lucide-react";
import { blockEl } from "@/lib/anchor";
import { blockText, type Block } from "@/lib/article";
import type { DocIndex } from "@/lib/doc";
import { useStore } from "@/lib/store";
import { barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";

/**
 * Read aloud, with the voices built into the browser: no server, no key. The
 * text is spoken a sentence or two at a time from where you are, and the
 * paragraph being read is marked like the keyboard cursor so the eye can
 * follow along.
 */

type Status = "idle" | "playing" | "paused" | "error";
type ListenState = { status: Status; block: string | null; rate: number; error?: string };

const RATES = [1, 1.2, 1.4, 1.7, 2, 0.8];
const RATE_KEY = "gloss:listen-rate";
/** Some browsers go quiet partway through a long utterance, so each one is kept short. */
const MAX_CHARS = 260;

const useListen = create<ListenState>(() => ({ status: "idle", block: null, rate: 1 }));

function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + s).length > MAX_CHARS) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > MAX_CHARS ? c.match(new RegExp(`[\\s\\S]{1,${MAX_CHARS}}(\\s|$)`, "g")) ?? [c] : [c]));
}

const SPOKEN = new Set<Block["type"]>(["p", "h2", "h3", "quote", "li", "note"]);

/** The nicest voice on offer in the page's language: the "natural" ones first. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  const mine = all.filter((v) => v.lang.toLowerCase().startsWith(base));
  const pool = mine.length ? mine : all;
  return pool.find((v) => /natural|neural|online/i.test(v.name)) ?? pool.find((v) => v.localService && v.default) ?? pool.find((v) => v.default) ?? pool[0] ?? null;
}

/* ---------------- the engine: one voice at a time ---------------- */

let items: { block: string; text: string }[] = [];
let idx = 0;
let session = 0;

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;

function speakAt(i: number, s: number) {
  if (s !== session) return;
  if (i >= items.length) return stopListening();
  idx = i;
  const u = new SpeechSynthesisUtterance(items[i].text);
  const lang = document.documentElement.lang || navigator.language || "en";
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? lang;
  u.rate = useListen.getState().rate;
  u.onend = () => s === session && useListen.getState().status === "playing" && speakAt(i + 1, s);
  u.onerror = (e) => {
    // Cancelling (stop, a speed change) reports as an error too: only a real one is shown.
    if (s !== session || e.error === "canceled" || e.error === "interrupted") return;
    useListen.setState({ status: "error", error: "The voice stopped. Try again." });
  };
  useListen.setState({ block: items[i].block, status: "playing", error: undefined });
  speechSynthesis.speak(u);
}

export function startListening(ix: DocIndex, fromBlock: string | null) {
  stopListening();
  if (!supported()) {
    useListen.setState({ status: "error", error: "This browser can't read aloud." });
    return;
  }
  const blocks = ix.article.blocks;
  const at = Math.max(0, fromBlock ? blocks.findIndex((b) => b.id === fromBlock) : 0);
  items = [];
  for (const b of blocks.slice(at)) {
    if (!SPOKEN.has(b.type)) continue;
    const t = blockText(b).trim();
    if (!t) continue;
    for (const c of chunks(t)) items.push({ block: b.id, text: c });
  }
  if (!items.length) return;
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    if (RATES.includes(r)) useListen.setState({ rate: r });
  } catch {}
  const s = ++session;
  // Voices load late in some browsers; the first sentence waits for them, briefly.
  if (!speechSynthesis.getVoices().length) {
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      speakAt(0, s);
    };
    speechSynthesis.addEventListener("voiceschanged", go, { once: true });
    setTimeout(go, 600);
  } else speakAt(0, s);
}

export function stopListening() {
  session++;
  if (supported()) speechSynthesis.cancel();
  items = [];
  useListen.setState({ status: "idle", block: null, error: undefined });
}

function toggleListening() {
  const { status } = useListen.getState();
  if (status === "playing") {
    // Pausing mid-sentence is unreliable across browsers; stopping and picking the sentence up again is not.
    session++;
    speechSynthesis.cancel();
    useListen.setState({ status: "paused" });
  } else if (status === "paused" || status === "error") {
    speakAt(idx, ++session);
  }
}

function cycleRate() {
  const { rate, status } = useListen.getState();
  const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  useListen.setState({ rate: next });
  try {
    localStorage.setItem(RATE_KEY, String(next));
  } catch {}
  // A new speed takes effect from the start of the sentence being read.
  if (status === "playing") {
    session++;
    speechSynthesis.cancel();
    speakAt(idx, session);
  }
}

/* ---------------- the controls ---------------- */

/** In the top bar, only when Listen is on in settings. Starts from the paragraph you are on. */
export function ListenButton({ from }: { from: () => string | null }) {
  const { ix } = useReader();
  const on = useStore((s) => s.settings.listen);
  const status = useListen((s) => s.status);
  if (!on) return null;
  const active = status !== "idle";
  return (
    <button
      type="button"
      className={`${barBtn} ${active ? "bg-sunk text-ink" : ""}`}
      aria-label={active ? "Stop reading aloud" : "Read aloud from here"}
      aria-pressed={active}
      data-tip={active ? "Stop reading aloud" : "Read aloud from here"}
      onClick={() => {
        if (active) return stopListening();
        // The paragraph cursor when it is on screen, otherwise the first paragraph in view.
        const cursor = useStore.getState().cursor;
        const r = cursor ? blockEl(cursor)?.getBoundingClientRect() : null;
        startListening(ix, r && r.bottom > 0 && r.top < window.innerHeight ? cursor : from());
      }}
    >
      <Headphones size={16} strokeWidth={1.8} />
    </button>
  );
}

/** While the voice is reading: a small bar just above the question box, and the cursor on the paragraph being read. */
export function ListenBar() {
  const { ix, jumpToBlock } = useReader();
  const { status, block, rate, error } = useListen();
  const on = useStore((s) => s.settings.listen);
  const setUI = useStore((s) => s.setUI);
  const prev = useRef<string | null>(null);

  // Leaving the text, or switching Listen off, stops the voice.
  useEffect(() => () => stopListening(), [ix]);
  useEffect(() => {
    if (!on) stopListening();
  }, [on]);

  // Follow the voice, but only while the reader is following too.
  useEffect(() => {
    if (!block) {
      prev.current = null;
      return;
    }
    setUI({ cursor: block });
    const was = prev.current ? blockEl(prev.current)?.getBoundingClientRect() : null;
    const following = !was || (was.bottom > 0 && was.top < window.innerHeight);
    const r = blockEl(block)?.getBoundingClientRect();
    if (following && r && (r.top < 80 || r.bottom > window.innerHeight * 0.8)) jumpToBlock(block, { flash: false });
    prev.current = block;
  }, [block, jumpToBlock, setUI]);

  if (status === "idle") return null;
  const n = block ? ix.numbers.get(block) : undefined;

  return (
    <div
      role="region"
      aria-label="Reading aloud"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 sm:bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[46] flex -translate-x-1/2 items-center gap-1 rounded-full bg-lens p-1 text-lens-fg shadow-pop ring-1 ring-black/5"
      style={{ animation: "rise 0.35s var(--ease-out) both" }}
    >
      <button
        type="button"
        onClick={toggleListening}
        aria-label={status === "playing" ? "Pause" : status === "error" ? "Try again" : "Play"}
        className="grid size-9 place-items-center rounded-full bg-[var(--rubric)] text-white transition-transform active:scale-90"
      >
        {status === "playing" ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />}
      </button>
      {status === "error" ? (
        <span className="max-w-[min(360px,60vw)] truncate px-2 text-[13px]" title={error}>
          {error}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => block && jumpToBlock(block, { flash: false })}
          className="h-9 rounded-full px-2.5 text-[13px] tabular-nums text-lens-fg/85 transition-colors hover:bg-lens-hover hover:text-lens-fg"
          aria-label={n ? `Reading paragraph ${n}. Show it.` : "Show where it is reading"}
        >
          {n ? `Reading ¶${n}` : "Reading"}
        </button>
      )}
      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Speed ${rate} times. Change speed.`}
        className="h-9 min-w-[48px] rounded-full px-2.5 text-[13px] font-medium tabular-nums transition-colors hover:bg-lens-hover"
      >
        {`${rate}×`}
      </button>
      <button type="button" onClick={stopListening} aria-label="Stop reading aloud" className="grid size-9 place-items-center rounded-full text-lens-fg/80 transition-colors hover:bg-lens-hover hover:text-lens-fg">
        <Square size={13} fill="currentColor" strokeWidth={0} />
      </button>
    </div>
  );
}
