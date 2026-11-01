"use client";

import { useCallback, useEffect, useState } from "react";

interface KeyView {
  code: string;
  planName: string;
  key: string | null;
  active: boolean;
  expiresAt: string | null;
  secondsLeft: number;
}

type Phase =
  | { kind: "polling" }
  | { kind: "ready"; keys: KeyView[] }
  | { kind: "error"; message: string };

/** `2026-11-30 14:07:59` (UTC, as SQLite stores it) → a local date and time. */
function until(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const date = new Date(`${expiresAt.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return date.toLocaleString();
}

/**
 * The reveal for a CourseMate purchase.
 *
 * There is no account and no password to show — the deliverable is one gateway
 * key, so the page waits for the webhook to mint it and then shows it once, with
 * the single instruction that matters: paste it into the app.
 */
export default function CourseMateKeySuccessClient({
  sessionId,
}: {
  sessionId: string | null;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "polling" });
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!sessionId) {
      setPhase({
        kind: "error",
        message: "Missing payment reference. Check your email for the receipt.",
      });
      return;
    }
    try {
      const res = await fetch(
        `/api/coursemate/keys?session_id=${encodeURIComponent(sessionId)}`,
      );
      const data = await res.json();
      if (res.ok && data.ready) {
        setPhase({ kind: "ready", keys: data.keys as KeyView[] });
        return;
      }
      if (res.ok && data.failed) {
        setPhase({
          kind: "error",
          message:
            data.error ??
            "The gateway did not issue your key. You have been charged — contact us and we will issue it or refund it.",
        });
        return;
      }
      if (!res.ok) {
        setPhase({
          kind: "error",
          message: data.error ?? "Could not read your key.",
        });
        return;
      }
      // The webhook has not minted yet: ask again shortly.
      setAttempt((count) => count + 1);
    } catch {
      setAttempt((count) => count + 1);
    }
  }, [sessionId]);

  useEffect(() => {
    if (phase.kind !== "polling" || !sessionId) return;
    const timer = setTimeout(poll, attempt === 0 ? 0 : 2500);
    return () => clearTimeout(timer);
  }, [poll, phase.kind, attempt, sessionId]);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      // The block is selectable; a clipboard refusal is not worth an error.
    }
  }

  if (phase.kind === "polling") {
    return (
      <div className="glass w-full rounded-3xl p-8 text-center text-zinc-600 dark:text-zinc-400">
        Payment received — waiting for the gateway to issue your key…
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="glass w-full rounded-3xl p-8 text-center text-red-600 dark:text-red-400">
        {phase.message}
      </div>
    );
  }

  const live = phase.keys.filter((key) => key.active && key.key);

  return (
    <div className="glass w-full space-y-6 rounded-3xl p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">
          Paid
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Your CourseMate key
        </h1>
      </div>

      {live.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every key on this purchase has expired, so there is nothing left to
          show — the gateway has deleted them.
        </p>
      ) : (
        <div className="space-y-4">
          {live.map((key) => (
            <div
              key={key.code}
              className="space-y-2 rounded-2xl border border-zinc-950/10 bg-white/60 p-4 dark:border-white/10 dark:bg-black/20"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                {key.planName} · valid until {until(key.expiresAt)}
              </p>
              <code className="block break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {key.key}
              </code>
              <button
                type="button"
                onClick={() => copy(key.key as string)}
                className="rounded-lg border border-zinc-950/15 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-brand-500 hover:text-brand-600 dark:border-white/15 dark:text-zinc-200"
              >
                {copied === key.key ? "Copied" : "Copy key"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Paste it into CourseMate → Settings → API key. The server is already set
        to <span className="font-mono">cm.innotel.tech</span>, so there is nothing
        else to configure.
      </p>

      <a
        href="https://coursemate.innotel.tech"
        className="inline-block text-sm font-semibold text-brand-600 hover:underline"
      >
        About CourseMate →
      </a>
    </div>
  );
}
