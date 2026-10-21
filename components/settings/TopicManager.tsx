"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { TOPICS, topicKeyFor, UNSORTED, type Topic } from "@/lib/library";
import { useStore } from "@/lib/store";

const PALETTE = ["#c2553b", "#d98a2b", "#c9a227", "#4f9a55", "#2f8f83", "#3f7cc0", "#5b4a9e", "#8a4fb0", "#b0487a", "#6b675f"];

/**
 * The family's topics: what the shelf is sorted into. Every change syncs, so
 * every computer (and the sorter) sees the same list.
 */
export function TopicManager() {
  // The registry follows the store; reading it here re-renders on every change.
  useStore((s) => s.topics);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const saveTopic = useStore((s) => s.saveTopic);
  const removeTopic = useStore((s) => s.removeTopic);
  const orderTopics = useStore((s) => s.orderTopics);
  const [adding, setAdding] = useState("");

  if (!hydrated) return null;
  const list = TOPICS.filter((t) => t.key !== UNSORTED);
  const count = (k: string) => library.filter((x) => x.topic === k).length;

  const move = (i: number, by: -1 | 1) => {
    const keys = list.map((t) => t.key);
    const j = i + by;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    orderTopics(keys);
  };

  const add = () => {
    const name = adding.trim();
    if (!name) return;
    const key = topicKeyFor(name, TOPICS.map((t) => t.key));
    saveTopic({ key, name, color: PALETTE[list.length % PALETTE.length], emoji: "📘", sort: list.length });
    setAdding("");
  };

  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-ink-3">
        Books are sorted into these, by hand or by the sorter, which reads each topic&rsquo;s hint. Taking a topic away moves its books to Unsorted.
      </p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {list.map((t, i) => (
          <TopicRowEditor
            key={t.key}
            topic={t}
            books={count(t.key)}
            first={i === 0}
            last={i === list.length - 1}
            onChange={(patch) => saveTopic({ key: t.key, name: t.name, color: t.color, emoji: t.emoji, hint: t.hint, blurb: t.blurb, sort: t.sort, ...patch })}
            onMove={(by) => move(i, by)}
            onRemove={() => {
              const n = count(t.key);
              if (n && !window.confirm(`Take away ${t.name}? Its ${n} ${n === 1 ? "book moves" : "books move"} to Unsorted.`)) return;
              removeTopic(t.key);
            }}
          />
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <input
          value={adding}
          maxLength={40}
          placeholder="A new topic, like Spanish or Chemistry"
          aria-label="New topic name"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-rule bg-transparent px-3.5 text-[14.5px] outline-none placeholder:text-ink-4 focus:border-rule-strong"
        />
        <button type="button" className="add-btn" disabled={!adding.trim()} onClick={add}>
          <Plus size={14} /> Add topic
        </button>
      </div>
    </div>
  );
}

type Patch = Partial<Pick<Topic, "name" | "color" | "emoji" | "hint" | "blurb">>;

function TopicRowEditor({ topic: t, books, first, last, onChange, onMove, onRemove }: { topic: Topic; books: number; first: boolean; last: boolean; onChange: (p: Patch) => void; onMove: (by: -1 | 1) => void; onRemove: () => void }) {
  const [name, setName] = useState(t.name);
  const [emoji, setEmoji] = useState(t.emoji);
  const [hint, setHint] = useState(t.hint ?? "");
  const commit = (p: Patch) => {
    if (Object.entries(p).some(([k, v]) => t[k as keyof Patch] !== v)) onChange(p);
  };

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-4">
      <input
        value={emoji}
        aria-label={`${t.name} emoji`}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={() => {
          const first = [...new Intl.Segmenter().segment(emoji.trim())][0]?.segment;
          setEmoji(first || t.emoji);
          if (first) commit({ emoji: first });
        }}
        className="size-10 shrink-0 rounded-xl border border-rule bg-transparent text-center text-[20px] outline-none focus:border-rule-strong"
      />
      <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-rule" style={{ background: t.color }} data-tip="Color">
        <input type="color" value={t.color} aria-label={`${t.name} color`} onChange={(e) => commit({ color: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <div className="min-w-0 flex-1 basis-56">
        <input
          value={name}
          maxLength={40}
          aria-label="Topic name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? commit({ name: name.trim() }) : setName(t.name))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-10 w-full rounded-xl border border-transparent bg-transparent px-2 text-[15px] font-medium text-ink outline-none hover:border-rule focus:border-rule-strong"
        />
        <input
          value={hint}
          maxLength={200}
          aria-label={`What goes in ${t.name}`}
          placeholder="What goes here, for the sorter: fractions, times tables…"
          onChange={(e) => setHint(e.target.value)}
          onBlur={() => commit({ hint: hint.trim() || undefined })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-8 w-full rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-ink-3 outline-none placeholder:text-ink-4 hover:border-rule focus:border-rule-strong"
        />
        <p className="px-2 pt-0.5 text-[12px] text-ink-4">
          {books} {books === 1 ? "book" : "books"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 self-center">
        <IconButton label="Move up" disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp size={15} />
        </IconButton>
        <IconButton label="Move down" disabled={last} onClick={() => onMove(1)}>
          <ArrowDown size={15} />
        </IconButton>
        <IconButton label={`Take away ${t.name}`} onClick={onRemove}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
