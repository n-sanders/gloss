"use client";

import Link from "next/link";
import { Highlighter, Library, Plus, Settings } from "lucide-react";
import { Lockup } from "@/components/brand/Gloss";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { barBtn } from "@/components/ui/Popover";
import { useStore } from "@/lib/store";

/**
 * The bar across the top of the shelf and the family settings: the same
 * pieces in the same places on both, so moving between them never shifts anything.
 */
export function TopBar({ here, onLibrary, onAdd }: { here?: "library" | "settings"; onLibrary?: () => void; onAdd?: () => void }) {
  const setUI = useStore((s) => s.setUI);
  return (
    <header className="relative z-20 mx-auto flex h-[var(--topbar-h)] w-full max-w-[1400px] shrink-0 items-center justify-between px-5 max-[380px]:px-4 sm:px-8">
      <Lockup />
      <nav aria-label="Main" className="flex items-center gap-1 max-[380px]:gap-0">
        <Link
          href="/"
          aria-current={here === "library" ? "page" : undefined}
          onClick={(e) => {
            if (!onLibrary) return;
            e.preventDefault();
            onLibrary();
          }}
          className="mr-1 inline-flex h-9 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink aria-[current=page]:bg-sunk aria-[current=page]:text-ink max-sm:w-9 max-sm:justify-center max-sm:px-0"
        >
          <Library size={17} />
          <span className="max-sm:hidden">Library</span>
        </Link>
        {onAdd && (
          <button type="button" className={barBtn} aria-label="Add a book" data-tip="Add a book" data-tip-hint="An activity, a reading, or an agent" onClick={onAdd}>
            <Plus size={16} strokeWidth={1.8} />
          </button>
        )}
        {here === "library" && (
          <button type="button" className={barBtn} aria-label="All highlights" data-tip="All highlights" onClick={() => setUI({ shelf: "highlights" })}>
            <Highlighter size={16} strokeWidth={1.8} />
          </button>
        )}
        <SettingsMenu compact />
        <Link href="/settings" aria-current={here === "settings" ? "page" : undefined} aria-label="Family settings" data-tip="Family settings" className={`${barBtn} aria-[current=page]:bg-sunk aria-[current=page]:text-ink`}>
          <Settings size={16} strokeWidth={1.8} />
        </Link>
      </nav>
    </header>
  );
}
