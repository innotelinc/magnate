"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, KeyIcon } from "./icons";
import CopyButton from "./CopyButton";

interface SessionView {
  code: string;
  planSlug: string;
  planName: string;
  key: string | null;
  claimToken: string | null;
  active: boolean;
  expiresAt: string | null;
  secondsLeft: number;
}

type Phase =
  | { kind: "polling" }
  | { kind: "ready"; sessions: SessionView[] }
  | { kind: "error"; message: string };

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SageSuccessClient({
  sessionId,
  sageUrl,
}: {
  sessionId: string | null;
  /** Where the claim link lands; the app redeems the token on load. */
  sageUrl: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "polling" });
  const [attempt, setAttempt] = useState(0);

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
        `/api/sage/sessions?session_id=${encodeURIComponent(sessionId)}`,
      );
      const data = await res.json();
      if (res.ok && data.ready) {
        setPhase({ kind: "ready", sessions: data.sessions as SessionView[] });
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
          message: data.error ?? "Could not retrieve your session.",
        });
        return;
      }
      if (attempt < 20) {
        setTimeout(() => setAttempt((a) => a + 1), 1500);
      } else {
        setPhase({
          kind: "error",
          message:
            "Payment went through but the gateway has not issued the key yet. Reload this page in a minute.",
        });
      }
    } catch {
      setTimeout(() => setAttempt((a) => a + 1), 1500);
    }
  }, [sessionId, attempt]);

  useEffect(() => {
    const timer = setTimeout(poll, 0);
    return () => clearTimeout(timer);
  }, [poll]);

  if (phase.kind === "polling") {
    return (
      <div className="animate-fade-in w-full text-center">
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-zinc-950/15 border-t-brand-400 dark:border-white/10" />
        </div>
        <h1 className="mt-8 text-3xl font-bold tracking-tight">Payment received 🎉</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Minting your gateway key… this takes a second.
        </p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="animate-fade-up w-full rounded-3xl glass p-8 text-center">
        <h1 className="text-2xl font-bold">Almost there</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{phase.message}</p>
        <Link
          href="/sage"
          className="mt-6 inline-block rounded-full border border-zinc-950/15 px-5 py-2.5 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          Back to Sage sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up w-full">
      <div className="text-center">
        <div className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/40">
          <CheckIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Your session key{phase.sessions.length === 1 ? " is" : "s are"} ready
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Tap <strong>Open Sage</strong> and the app installs the key itself, or
          copy it into Settings → Gateway. Use it as often as you like — it dies
          when the clock does.
        </p>
      </div>

      <div className="mt-7 space-y-3">
        {phase.sessions.map((session) => (
          <div key={session.code} className="glass rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 ring-1 ring-zinc-950/10 dark:text-brand-300 dark:ring-white/10">
                  <KeyIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-500">
                    {session.planName} · {session.code}
                  </p>
                  <p className="font-mono text-sm font-semibold break-all">
                    {session.key ?? "expired — this key has been revoked"}
                  </p>
                </div>
              </div>
              {session.key && <CopyButton value={session.key} />}
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-500">
              {session.active
                ? `${clock(session.secondsLeft)} left in this session.`
                : "This session has ended. Buy another on the Sage sessions page."}
            </p>
            {session.active && session.claimToken && session.key && (
              // The whole handoff: the app reads the token from the fragment,
              // trades it for this key and stores it. Nothing to retype on a
              // phone, and nothing in the key that outlives its window.
              <a
                href={`${sageUrl.replace(/\/+$/, "")}/#claim=${session.claimToken}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 dark:bg-white dark:text-zinc-950"
              >
                Open Sage with this key
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-7 flex justify-center">
        <Link
          href="/sage"
          className="rounded-xl border border-zinc-950/15 bg-black/[0.04] px-5 py-3 text-sm font-medium transition-all hover:border-zinc-950/30 dark:border-white/15 dark:bg-white/[0.04] dark:hover:border-white/30"
        >
          Buy another session
        </Link>
      </div>
    </div>
  );
}
