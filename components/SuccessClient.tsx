"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CheckIcon,
  CopyIcon,
  KeyIcon,
  UserIcon,
  FilmIcon,
  LockIcon,
} from "./icons";

interface ClaimResult {
  ready: boolean;
  username?: string;
  password?: string;
  alreadyClaimed?: boolean;
  error?: string;
}

type Phase =
  | { kind: "polling" }
  | { kind: "ready"; username: string; password: string; alreadyClaimed: boolean }
  | { kind: "error"; message: string };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-white/25 hover:text-white"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-400" /> : <CopyIcon className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SuccessClient({
  sessionId,
  jellyfinUrl,
  jfaGoUrl,
}: {
  sessionId: string | null;
  jellyfinUrl: string;
  jfaGoUrl: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "polling" });
  const [attempt, setAttempt] = useState(0);

  const poll = useCallback(async () => {
    if (!sessionId) {
      setPhase({
        kind: "error",
        message: "Missing payment reference. Check your email for confirmation.",
      });
      return;
    }
    try {
      const res = await fetch(`/api/claim-credentials?session_id=${encodeURIComponent(sessionId)}`);
      const data: ClaimResult = await res.json();
      if (res.ok && data.ready) {
        setPhase({
          kind: "ready",
          username: data.username!,
          password: data.password!,
          alreadyClaimed: Boolean(data.alreadyClaimed),
        });
        return;
      }
      if (!res.ok) {
        setPhase({ kind: "error", message: data.error ?? "Could not retrieve your credentials." });
        return;
      }
      // Not provisioned yet — poll again.
      if (attempt < 25) {
        setTimeout(() => setAttempt((a) => a + 1), 2000);
      } else {
        setPhase({
          kind: "error",
          message:
            "Your payment went through, but we're still setting up your account. Try again in a few minutes — or contact the admin.",
        });
      }
    } catch {
      setTimeout(() => setAttempt((a) => a + 1), 2000);
    }
  }, [sessionId, attempt]);

  useEffect(() => {
    // Defer the first poll so we don't synchronously set state in the effect.
    const timer = setTimeout(poll, 0);
    return () => clearTimeout(timer);
  }, [poll]);

  if (phase.kind === "polling") {
    return (
      <div className="animate-fade-in w-full text-center">
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-brand-400" />
        </div>
        <h1 className="mt-8 text-3xl font-bold tracking-tight">
          Payment received 🎉
        </h1>
        <p className="mt-3 text-zinc-400">
          Setting up your account on the media server… this takes just a moment.
        </p>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="animate-fade-up w-full rounded-3xl glass p-8 text-center">
        <h1 className="text-2xl font-bold">Almost there</h1>
        <p className="mt-3 text-zinc-400">{phase.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/#pricing"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium transition-colors hover:border-white/30"
          >
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up w-full">
      <div className="text-center">
        <div className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-xl shadow-emerald-500/40">
          <CheckIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          You&apos;re all set!
        </h1>
        <p className="mt-3 text-zinc-400">
          Your account is active. Here are your credentials —{" "}
          <span className="font-medium text-amber-300">
            save them now, they&apos;re only shown once.
          </span>
        </p>
      </div>

      {phase.alreadyClaimed && (
        <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          These credentials were already displayed earlier. If you lost them,
          reset your password via the account portal below.
        </div>
      )}

      <div className="mt-7 space-y-3">
        <div className="glass flex items-center justify-between gap-3 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-white/10">
              <UserIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-zinc-500">Username</p>
              <p className="font-mono text-base font-semibold">{phase.username}</p>
            </div>
          </div>
          <CopyButton value={phase.username} />
        </div>

        <div className="glass flex items-center justify-between gap-3 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-white/10">
              <KeyIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-zinc-500">Password</p>
              <p className="font-mono text-base font-semibold break-all">
                {phase.password}
              </p>
            </div>
          </div>
          <CopyButton value={phase.password} />
        </div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link
          href={jellyfinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:brightness-110"
        >
          <FilmIcon className="h-4 w-4" />
          Start watching now
        </Link>
        <Link
          href={jfaGoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] py-3.5 text-sm font-medium transition-all hover:border-white/30 hover:bg-white/[0.08]"
        >
          <LockIcon className="h-4 w-4" />
          Account portal
        </Link>
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        Prefer a web browser? Open{" "}
        <span className="font-mono text-zinc-400">{jellyfinUrl}</span> and sign
        in with these details.
      </p>
    </div>
  );
}
