import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "./icons";
import type { PublicPlan } from "./PricingSection";

/**
 * What the platform actually sells, grouped by the service that sells it.
 *
 * This is the same catalogue `subscribe.innotel.us` presents, read from the same
 * `plans` table rather than a copy: the apex grid is a directory of services,
 * Magnate's own front page is the price list. A plan belongs to exactly one
 * service, so a group is that service's page and a card is that service's
 * price — nothing here invents a bundle price, and nothing is hard-coded.
 */
const SERVICE_LABEL: Record<string, string> = {
  monarch: "Monarch",
  jellyfin: "Jellyfin",
  zeus: "Zeus",
  capstone: "Capstone",
  oasis: "Oasis",
  onyx: "Onyx",
  signara: "Signara",
  atlas: "Atlas",
  atheniq: "AthenIQ",
  plutus: "PLUTUS",
  distro: "Distro",
  genesis: "Genesis",
  ontrak: "OnTrak",
  engineer: "OnTrak Engineer",
  g0dm0d3: "Uncensored Godmode",
  verifier: "Verifier",
  genie: "Genie",
  sage: "Sage",
  orion: "Orion",
  rizzaura: "Rizz Aura",
  zapit: "ZapIt",
  cerulean: "Cerulean",
  jellyfin_legacy: "Jellyfin",
  generic: "Platform membership",
};

function label(service: string): string {
  return (
    SERVICE_LABEL[service] ??
    service.replace(/(^|[-_])([a-z])/g, (_, __, c: string) => ` ${c.toUpperCase()}`).trim()
  );
}

function price(plan: PublicPlan): { head: string; unit: string } {
  // A plan sold by the unit has no meaningful monthly figure — quoting it would
  // advertise a free product that charges at checkout.
  if (plan.perUnit && plan.pricePerUnitCents) {
    return {
      head: `$${(plan.pricePerUnitCents / 100).toFixed(plan.pricePerUnitCents % 100 === 0 ? 0 : 2)}`,
      unit: ` per ${plan.billingUnit || "unit"}`,
    };
  }
  const cents = plan.priceMonthlyCents || plan.priceYearlyCents;
  const per = plan.priceMonthlyCents ? "/month" : "/year";
  return {
    head: `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`,
    unit: per,
  };
}

/** Where a buyer actually goes for this plan. */
function href(service: string, plan: PublicPlan): string {
  if (service === "sage") return "/sage";
  if (service === "generic") return `/signup?plan=${encodeURIComponent(plan.slug)}`;
  return plan.perUnit
    ? `https://subscribe.${service}.innotel.us`
    : `/signup?plan=${encodeURIComponent(plan.slug)}`;
}

export default function CatalogSection({
  groups,
}: {
  groups: { service: string; plans: PublicPlan[] }[];
}) {
  if (!groups.length) return null;

  const total = groups.reduce((n, g) => n + g.plans.length, 0);

  return (
    <section
      id="subscriptions"
      className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-black/[0.04] px-3 py-1 text-xs font-medium text-brand-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-brand-300">
            {total} subscriptions, priced live
          </span>
          <h2 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Everything for sale.{" "}
            <span className="text-gradient">One account.</span>
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            The same catalogue as{" "}
            <a
              href="https://subscribe.innotel.us"
              className="text-brand-600 underline-offset-4 hover:underline dark:text-brand-300"
            >
              subscribe.innotel.us
            </a>
            , read from this platform&apos;s own price list. Every service prices
            itself; nothing is bundled and nothing here is a guess.
          </p>
        </div>

        <div className="mt-14 space-y-14">
          {groups.map((group) => (
            <div key={group.service}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-950/10 pb-3 dark:border-white/[0.06]">
                <h3 className="text-xl font-semibold tracking-tight">
                  {label(group.service)}
                </h3>
                {group.service !== "generic" && (
                  <a
                    href={`https://subscribe.${group.service}.innotel.us`}
                    className="inline-flex items-center gap-1 text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
                  >
                    {label(group.service)} page
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {group.plans.map((plan) => {
                  const priced = price(plan);
                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col rounded-2xl p-6 ${
                        plan.highlighted
                          ? "bg-brand-600/[0.08] ring-1 ring-brand-500/40"
                          : "glass"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-semibold">{plan.name}</h4>
                        {plan.addon && (
                          <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
                            Add-on
                          </span>
                        )}
                      </div>
                      {plan.description && (
                        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                          {plan.description}
                        </p>
                      )}

                      <div className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tracking-tight">
                          {priced.head}
                        </span>
                        <span className="text-sm text-zinc-600 dark:text-zinc-500">
                          {priced.unit}
                        </span>
                      </div>

                      {plan.features.length > 0 && (
                        <ul className="mt-5 flex-1 space-y-2">
                          {plan.features.slice(0, 4).map((feature) => (
                            <li
                              key={feature}
                              className="flex items-start gap-2 text-sm text-zinc-800 dark:text-zinc-300"
                            >
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300">
                                <CheckIcon className="h-2.5 w-2.5" />
                              </span>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}

                      <Link
                        href={href(group.service, plan)}
                        className="mt-6 rounded-xl bg-zinc-950 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        {group.service === "sage"
                          ? "Start a session"
                          : plan.perUnit
                            ? `Buy ${plan.billingUnit || "credits"}`
                            : `Choose ${plan.name}`}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
