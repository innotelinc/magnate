"use client";

import { useSyncExternalStore, useEffect, useRef, useState } from "react";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

/* ---------- external store: the persisted theme preference ---------- */

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Keep the menu in sync when another tab changes the preference.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

/* ---------- helpers ---------- */

function getSystem(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolve(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystem() : theme;
}

export default function ThemeToggle() {
  // Mirrors the inline script in app/layout.tsx: reads the same localStorage
  // key so React state always agrees with the DOM attribute. The attribute
  // itself is kept in sync by components/ThemeApplier.tsx (every page) plus
  // this component's select() handler.
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "system" as Theme);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(value: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures (e.g. private mode); the attribute still applies.
    }
    document.documentElement.setAttribute("data-theme", resolve(value));
    emit(); // notify this tab's store subscribers
    setOpen(false);
  }

  const active = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Change color theme"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Theme: ${active.label}`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-950/15 text-zinc-600 transition-colors hover:border-zinc-950/30 hover:text-zinc-950 dark:border-white/15 dark:text-zinc-400 dark:hover:border-white/30 dark:hover:text-white"
      >
        <active.Icon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Color theme"
          className="animate-pop-in absolute right-0 top-11 z-50 w-40 overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-1.5 shadow-xl shadow-zinc-950/10 dark:border-white/10 dark:bg-[#0d0f18] dark:shadow-black/50"
        >
          {OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => select(value)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                theme === value
                  ? "bg-brand-500/10 font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-zinc-700 hover:bg-black/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {theme === value && <CheckIcon className="ml-auto h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
