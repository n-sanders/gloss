"use client";

import { memo, useState } from "react";
import { coverSrc } from "@/lib/covers";
import { isTag, lookOf, TAG_EMOJI, TOPIC, topicOf, type Book, type Look, type TagKey, type TopicKey } from "@/lib/library";

/** A topic's or a tag's emoji, sized like an icon. */
export function Glyph({ k, size = 18, className = "" }: { k: TopicKey | TagKey; size?: number; className?: string }) {
  const emoji = isTag(k) ? TAG_EMOJI[k] : TOPIC[topicOf(k)].emoji;
  return (
    <span aria-hidden className={`glyph ${className}`} style={{ ["--g" as string]: `${size}px` }}>
      {emoji}
    </span>
  );
}

/** A topic's picture, for a book with no cover of its own: its emoji on a pattern in its colours. */
export function TopicArt({ k, className = "" }: { k: TopicKey; className?: string }) {
  const t = TOPIC[topicOf(k)];
  const [base, light, dark, pale] = t.shades;
  return (
    <span aria-hidden className={`topic-art ${className}`} style={{ ["--a" as string]: base, ["--b" as string]: light, ["--c" as string]: dark, ["--d" as string]: pale }}>
      <span className="topic-art-emoji">{t.emoji}</span>
    </span>
  );
}

const lastName = (a: string) => a.split(/&|,| and /)[0].trim().split(/\s+/).slice(-1)[0] || a;

/** A book seen end-on: cloth, a title running down it, the author at the foot. */
export const Spine = memo(function Spine({ book, look = lookOf(book) }: { book: Book; look?: Look }) {
  const { w, h, color, fg, style } = look;
  const t = TOPIC[topicOf(book.topic)];
  const wide = w >= 52;
  const by = lastName(book.author);
  // The author across the foot, as large as fits; on a spine too slim for the
  // whole name, it runs down after the title instead of being cut off.
  const bySize = Math.min(11, w * 0.22, (w - 12) / Math.max(1, by.length * 0.56));
  const narrow = w < 44 || bySize < 8;
  // Fit the title down the spine: shrink a long one, within reason, before it is cut short.
  const per = style === "sans" ? 0.54 : 0.5;
  const room = h - (style === "label" ? 92 : style === "bands" ? 96 : 70);
  const chars = book.title.length + (narrow ? by.length * 0.8 + 2 : 0);
  const base = Math.max(10.5, Math.min(15.5, w * 0.36)) * (style === "sans" ? 0.86 : 1);
  const size = Math.max(9, Math.min(base, (room * (wide ? 2 : 1)) / (chars * per)));
  const reading = book.pct > 0 && book.pct < 1;
  return (
    <div
      className={`spine ${narrow ? "is-narrow" : ""} ${wide ? "is-wide" : ""}`}
      data-style={style}
      data-light={look.light || undefined}
      style={{ width: w, height: h, background: color, color: fg, ["--fg" as string]: fg }}
    >
      {reading && <span className="spine-ribbon" aria-hidden />}
      {style === "bands" && (
        <>
          <span className="spine-bands top" />
          <span className="spine-bands bottom" />
        </>
      )}
      {style === "foil" && <span className="spine-orn">{book.favorite ? "★" : "◆"}</span>}
      {style === "sans" && <Glyph k={t.key} size={15} className="spine-emoji" />}
      <span className={`spine-title-wrap ${style === "label" ? "is-label" : ""}`}>
        <span className="spine-title" style={{ fontSize: size }}>
          {book.title}
          {narrow && <span className="spine-by">{by}</span>}
        </span>
      </span>
      {!narrow && (
        <span className="spine-author" style={{ fontSize: bySize }}>
          {by}
        </span>
      )}
    </div>
  );
});

/**
 * The picture on a cover, best first: its own cover (painted, uploaded or
 * linked), then the page's own picture printed in the topic's ink, then the
 * topic's plate.
 */
export function Plate({ book, reveal = false }: { book: Book; reveal?: boolean }) {
  // Pictures that failed to load, by address, so a new cover gets its own chance.
  const [broken, setBroken] = useState<string[]>([]);
  const fail = (src: string) => () => setBroken((b) => [...b, src]);
  const cls = reveal ? "is-revealing" : "";
  const own = coverSrc(book);
  if (own && !broken.includes(own)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={own} alt="" decoding="async" draggable={false} referrerPolicy="no-referrer" className={cls} onError={fail(own)} />;
  }
  if (book.image && !broken.includes(book.image)) {
    const t = TOPIC[topicOf(book.topic)];
    return (
      <span className="duotone" style={{ ["--ink-c" as string]: t.shades[2] }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={book.image} alt="" decoding="async" loading="lazy" draggable={false} referrerPolicy="no-referrer" className={cls} onError={fail(book.image)} />
      </span>
    );
  }
  return <TopicArt k={book.topic} className={cls} />;
}

/**
 * The front of a book, for face-out display and for the book in your hands.
 * Sized by its container, so the same cover works at any scale.
 */
export const Cover = memo(function Cover({ book, look = lookOf(book), draw = false }: { book: Book; look?: Look; draw?: boolean }) {
  const t = TOPIC[topicOf(book.topic)];
  return (
    <div className="cover" data-light={look.light || undefined} style={{ background: look.color, color: look.fg }}>
      <div className="cover-plate">
        <Plate book={book} reveal={draw} />
      </div>
      <div className="cover-type">
        <p className="cover-kicker">
          <Glyph k={t.key} size={14} className="cover-glyph" />
          <span>{t.name}</span>
          {book.year && <span className="tabular-nums">{book.year}</span>}
        </p>
        <p className="cover-title">{book.title}</p>
        <p className="cover-author">{book.author}</p>
      </div>
      <span className="cover-hinge" aria-hidden />
    </div>
  );
});
