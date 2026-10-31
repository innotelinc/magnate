"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

/** Copy-to-clipboard, with the "Copied" beat the rest of the site uses. */
export default function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 bg-black/[0.05] px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-all hover:border-zinc-950/30 hover:text-zinc-950 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-white"
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
