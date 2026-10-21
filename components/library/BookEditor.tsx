"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Paintbrush, Upload, X } from "lucide-react";
import { readingMinutes } from "@/lib/article";
import { deleteCover, paintCover, putCover, serverKept } from "@/lib/covers";
import { hostOf, isHex, lookOf, TOPIC, TOPICS, topicOf, type Book } from "@/lib/library";
import { useStore, type LibraryItem } from "@/lib/store";
import { Cover, Spine } from "./Book";

const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const UPLOAD_MAX = 6_000_000;

type CoverMode = "none" | "link" | "upload" | "paint";

const modeOf = (cover?: string): CoverMode => (cover === "uploaded" ? "upload" : cover === "painted" ? "paint" : cover ? "link" : "none");

/** A fresh activity's id: never a slug of its title, so renaming it never moves it. */
export const activityId = () => `act-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function newActivity(seed: { url?: string; title?: string; dek?: string; image?: string; site?: string } = {}): LibraryItem {
  return {
    id: activityId(),
    kind: "activity",
    title: seed.title ?? "",
    source: seed.site,
    words: 0,
    origin: "activity",
    addedAt: Date.now(),
    dek: seed.dek,
    sourceUrl: seed.url,
    cover: seed.image,
  };
}

function toBook(x: LibraryItem): Book {
  const kind = x.kind ?? "reading";
  return {
    id: x.id,
    kind,
    title: x.title.trim() || "Untitled",
    author: x.author?.trim() || x.source || hostOf(x.sourceUrl) || "",
    year: x.year,
    url: x.sourceUrl,
    topic: topicOf(x.topic),
    minutes: kind === "activity" ? 0 : readingMinutes(x.words),
    dek: x.dek,
    tags: x.tags ?? [],
    favorite: Boolean(x.favorite),
    pct: 0,
    highlights: 0,
    added: x.addedAt,
    image: x.image,
    cover: x.cover,
    coverRev: x.coverRev,
    color: x.color,
    agent: false,
  };
}

const validUrl = (v: string) => {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Everything about a book you can change by hand: what it is called, who made
 * it, where it lives, its topic and tags, its cloth and its cover. The spine
 * and cover beside the form change as you type. For a new activity this is
 * also where it is first shelved.
 */
export function BookEditor({ item, isNew, onClose }: { item: LibraryItem; isNew: boolean; onClose: () => void }) {
  const addItem = useStore((s) => s.addItem);
  const shelve = useStore((s) => s.shelve);
  const [d, setD] = useState<LibraryItem>(item);
  const [mode, setMode] = useState<CoverMode>(modeOf(item.cover));
  const [link, setLink] = useState(modeOf(item.cover) === "link" ? item.cover! : "");
  const [busy, setBusy] = useState<"upload" | "paint" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Server-kept covers made in this sitting, so a cancelled new book leaves none behind.
  const madeCover = useRef(false);

  const set = (patch: Partial<LibraryItem>) => setD((x) => ({ ...x, ...patch }));
  const activity = (d.kind ?? "reading") === "activity";
  const book = useMemo(() => toBook(d), [d]);
  const look = lookOf(book);
  const t = TOPIC[book.topic];
  const autoLook = lookOf({ ...book, color: undefined });

  const cancel = () => {
    if (isNew && madeCover.current) void deleteCover(d.id);
    onClose();
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
    // `cancel` reads the latest draft through refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMode = (m: CoverMode) => {
    setErr(null);
    setMode(m);
    if (m === "none") set({ cover: undefined, coverRev: undefined });
    if (m === "link") set({ cover: validUrl(link) ? link.trim() : undefined, coverRev: undefined });
    if (m === "upload" && d.cover !== "uploaded") fileRef.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) return setErr("Pick a JPEG, PNG, WebP or GIF.");
    if (file.size > UPLOAD_MAX) return setErr("That picture is too large (6 MB at most).");
    setBusy("upload");
    setErr(null);
    const e = await putCover(d.id, file);
    setBusy(null);
    if (e) return setErr(e);
    madeCover.current = true;
    setMode("upload");
    set({ cover: "uploaded", coverRev: Date.now() });
  };

  const paint = async () => {
    const scene = d.scene || [d.title.trim(), d.dek?.trim()].filter(Boolean).join(": ");
    if (!scene) return setErr("Give it a title first, so there is something to paint.");
    setBusy("paint");
    setErr(null);
    const r = await paintCover(d.id, scene, d.topic);
    setBusy(null);
    if (!r.ok) return setErr(r.error);
    madeCover.current = true;
    setMode("paint");
    set({ cover: "painted", coverRev: Date.now() });
  };

  const urlOk = !d.sourceUrl || validUrl(d.sourceUrl);
  const ready = d.title.trim().length > 0 && urlOk && (!activity || Boolean(d.sourceUrl?.trim())) && !busy;

  const save = () => {
    if (!ready) return;
    const tags = (d.tags ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 6);
    const out: LibraryItem = {
      ...d,
      title: d.title.trim(),
      author: d.author?.trim() || undefined,
      dek: d.dek?.trim() || undefined,
      sourceUrl: d.sourceUrl?.trim() || undefined,
      tags: tags.length ? tags : undefined,
      color: isHex(d.color) ? d.color : undefined,
    };
    // A server-kept cover that was swapped for something else goes from the server too.
    if (serverKept(item.cover) && !serverKept(out.cover)) void deleteCover(d.id);
    if (isNew) addItem(out);
    else {
      const patch: Partial<LibraryItem> = {};
      for (const k of ["title", "author", "dek", "sourceUrl", "topic", "tags", "color", "cover", "coverRev"] as const) {
        if (JSON.stringify(out[k]) !== JSON.stringify(item[k])) (patch as Record<string, unknown>)[k] = out[k];
      }
      if (Object.keys(patch).length) shelve(d.id, patch);
    }
    onClose();
  };

  const swatches = [...new Set(t.shades)];

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" style={{ animation: "fade 0.2s both" }} onClick={cancel} />
      <section role="dialog" aria-modal aria-label={isNew ? "Add an activity" : `Edit ${book.title}`} className="add-panel be-panel">
        <header className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[22px] leading-tight text-ink">{isNew ? (activity ? "A new activity" : "A new book") : "Edit book"}</h2>
          <button type="button" aria-label="Close" data-tip="Close" data-tip-kbd="Esc" onClick={cancel} className="grid size-9 place-items-center rounded-full text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
            <X size={17} />
          </button>
        </header>

        <div className="be-grid">
          <div className="be-preview" aria-hidden>
            <div className="be-spine" style={{ width: look.w, height: look.h }}>
              <Spine book={book} look={look} />
            </div>
            <div className="be-cover">
              <Cover book={book} look={look} />
            </div>
          </div>

          <form
            className="be-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Title">
              <input autoFocus={!isNew || !d.title} value={d.title} maxLength={300} onChange={(e) => set({ title: e.target.value })} className="be-input" />
            </Field>
            <Field label={activity ? "Link" : "Original link"} hint={activity ? "Where the activity lives. It opens in a new tab." : undefined}>
              <input
                type="url"
                value={d.sourceUrl ?? ""}
                placeholder="https://"
                spellCheck={false}
                onChange={(e) => set({ sourceUrl: e.target.value })}
                className="be-input"
                aria-invalid={!urlOk || undefined}
              />
            </Field>
            <Field label={activity ? "Made by" : "Author"}>
              <input value={d.author ?? ""} maxLength={120} placeholder={d.source || hostOf(d.sourceUrl) || ""} onChange={(e) => set({ author: e.target.value })} className="be-input" />
            </Field>
            <Field label="Description">
              <textarea value={d.dek ?? ""} rows={2} maxLength={400} onChange={(e) => set({ dek: e.target.value })} className="be-input be-area" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Topic">
                <select value={topicOf(d.topic)} onChange={(e) => set({ topic: e.target.value })} className="be-input">
                  {TOPICS.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tags" hint="Separated by commas.">
                <input
                  defaultValue={(d.tags ?? []).join(", ")}
                  onChange={(e) => set({ tags: e.target.value.split(",") })}
                  className="be-input"
                />
              </Field>
            </div>

            <Field label="Colour" group>
              <div className="be-swatches" role="radiogroup" aria-label="Colour">
                <button type="button" role="radio" aria-checked={!d.color} onClick={() => set({ color: undefined })} className="be-swatch is-auto" style={{ background: autoLook.color }} data-tip="The topic's colour">
                  <span>Auto</span>
                </button>
                {swatches.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={c} onClick={() => set({ color: c })} className="be-swatch" style={{ background: c }} />
                ))}
                <label className="be-swatch is-custom" data-tip="Any colour" aria-checked={Boolean(d.color && !swatches.includes(d.color))}>
                  <input type="color" value={isHex(d.color) ? d.color : look.color} onChange={(e) => set({ color: e.target.value })} aria-label="Any colour" />
                </label>
              </div>
            </Field>

            <Field label="Cover" group>
              <div className="lib-sort !ml-0 flex-wrap" role="radiogroup" aria-label="Cover">
                {(
                  [
                    ["none", "None"],
                    ["link", "Picture link"],
                    ["upload", "Upload"],
                    ["paint", "Paint with AI"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => pickMode(k)}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === "link" && (
                <input
                  type="url"
                  value={link}
                  placeholder="https://… a picture"
                  spellCheck={false}
                  onChange={(e) => {
                    setLink(e.target.value);
                    set({ cover: validUrl(e.target.value) ? e.target.value.trim() : undefined, coverRev: undefined });
                  }}
                  className="be-input mt-2"
                />
              )}
              {mode === "upload" && (
                <button type="button" className="be-ghost mt-2" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                  {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {d.cover === "uploaded" ? "Pick another picture" : "Pick a picture"}
                </button>
              )}
              {mode === "paint" && (
                <button type="button" className="be-ghost mt-2" onClick={() => void paint()} disabled={busy !== null}>
                  {busy === "paint" ? <Loader2 size={14} className="animate-spin" /> : <Paintbrush size={14} />}
                  {busy === "paint" ? "Painting… (up to a minute)" : d.cover === "painted" ? "Paint another" : "Paint a cover"}
                </button>
              )}
              <input ref={fileRef} type="file" accept={UPLOAD_TYPES.join(",")} hidden onChange={(e) => void upload(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            </Field>

            {err && <p className="text-[12.5px] text-rubric-text">{err}</p>}

            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" className="be-ghost" onClick={cancel}>
                Cancel
              </button>
              <button type="submit" className="add-btn !mt-0" disabled={!ready}>
                {isNew ? "Put it on the shelf" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}

/** A labelled field. `group`: several controls with their own labels, so the wrapper is not a <label>. */
function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="be-field">
      <span className="be-label">{label}</span>
      {children}
      {hint && <span className="be-hint">{hint}</span>}
    </Tag>
  );
}
