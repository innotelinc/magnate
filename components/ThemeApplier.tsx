"use client";

import { useLayoutEffect } from "react";

const STORAGE_KEY = "theme";

function getSystem(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStored(): "light" | "dark" | "system" {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

function apply() {
  const theme = readStored();
  const resolved = theme === "system" ? getSystem() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

/**
 * Keeps the resolved theme on <html> in sync on every page (including pages
 * that don't render a ThemeToggle, e.g. 404):
 * - Re-applies after React's dev StrictMode remount clears the attribute set
 *   by the inline script in app/layout.tsx (no-op in production).
 * - Follows OS theme changes while the preference is "system".
 * - Follows preference changes made in other tabs.
 */
export default function ThemeApplier() {
  useLayoutEffect(() => {
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readStored() === "system") apply();
    };
    const onStorage = () => apply();
    mq.addEventListener("change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
