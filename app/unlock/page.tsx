import type { Metadata } from "next";
import { GlossMark } from "@/components/brand/Gloss";
import { UnlockForm } from "./UnlockForm";

export const metadata: Metadata = { title: "Unlock" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function UnlockPage({ searchParams }: Props) {
  const { next } = await searchParams;
  // Only a path on this site: never send someone on to another one.
  const to = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-[360px]">
        <GlossMark className="mb-6 size-9" />
        <h1 className="font-serif text-[30px] leading-tight tracking-[-0.015em]">Our library</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">Type the family passphrase. This computer will remember it.</p>
        <UnlockForm next={to} />
      </div>
    </main>
  );
}
