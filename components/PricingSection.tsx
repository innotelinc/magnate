"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, SparklesIcon } from "./icons";

export interface PublicPlan {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  features: string[];
  highlighted: boolean;
}

export default function PricingSection({ plans }: { plans: PublicPlan[] }) {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="relative scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-brand-300">
            <SparklesIcon className="h-3.5 w-3.5" />
            Simple pricing
          </span>
          <h2 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            One subscription.{" "}
            <span className="text-gradient">Everything on demand.</span>
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Pick a plan, pay securely with Stripe, and start streaming in
            minutes. No contracts — cancel anytime.
          </p>
        </div>

        {/* Toggle */}
        <div className="mt-10 flex items-center justify-center gap-4">
          <span
            className={`text-sm font-medium transition-colors ${
              yearly ? "text-zinc-500" : "text-white"
            }`}
          >
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label="Toggle yearly billing"
            onClick={() => setYearly((v) => !v)}
            className="relative h-8 w-14 rounded-full border border-white/10 bg-white/[0.06] transition-colors hover:border-white/20"
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-500 shadow transition-all duration-300 ${
                yearly ? "left-7" : "left-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium transition-colors ${
              yearly ? "text-white" : "text-zinc-500"
            }`}
          >
            Yearly
          </span>
          <span className="hidden rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30 sm:block">
            2 months free
          </span>
        </div>

        {/* Cards */}
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const priceCents = yearly
              ? plan.priceYearlyCents
              : plan.priceMonthlyCents;
            const price = priceCents / 100;
            return (
              <div
                key={plan.id}
                style={{ animationDelay: `${i * 90}ms` }}
                className={`animate-fade-up relative flex flex-col rounded-3xl p-7 transition-all duration-300 ${
                  plan.highlighted
                    ? "glow-ring bg-gradient-to-b from-indigo-500/[0.12] via-white/[0.05] to-white/[0.03] md:-translate-y-2 md:hover:-translate-y-4"
                    : "glass hover:-translate-y-2 hover:border-white/20"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-indigo-500/40">
                    Most popular
                  </span>
                )}

                <h3 className="text-xl font-semibold">{plan.name}</h3>
                {plan.description && (
                  <p className="mt-1.5 text-sm text-zinc-400">
                    {plan.description}
                  </p>
                )}

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold tracking-tight">
                    ${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
                  </span>
                  <span className="text-sm text-zinc-500">
                    / {yearly ? "year" : "month"}
                  </span>
                </div>
                {yearly && (
                  <p className="mt-1 text-xs text-emerald-300">
                    Save {Math.round((1 - plan.priceYearlyCents / (plan.priceMonthlyCents * 12)) * 100)}% vs monthly
                  </p>
                )}

                <ul className="mt-7 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/signup?plan=${plan.slug}&interval=${yearly ? "year" : "month"}`}
                  className={`mt-8 rounded-xl py-3 text-center text-sm font-semibold transition-all duration-300 ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:brightness-110"
                      : "border border-white/15 bg-white/[0.04] text-white hover:border-white/30 hover:bg-white/[0.08]"
                  }`}
                >
                  Choose {plan.name}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="2" y="5" width="20" height="14" rx="2.5" />
              <path d="M2 10h20" />
            </svg>
            Secure checkout powered by Stripe. Your credentials are generated
            and shown once after payment.
          </span>
        </p>
      </div>
    </section>
  );
}
