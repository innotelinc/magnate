import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CourseMateKeysClient, {
  type CourseMatePlanOption,
} from "@/components/CourseMateKeysClient";
import { listPlansForService, planPublic } from "@/lib/plans";
import { COURSEMATE_MAX_KEYS, COURSEMATE_SPEND_SHARE } from "@/lib/coursemate";
import { coursemateSessionMinutes } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CourseMate keys — one key, one lecture",
  description:
    "A CourseMate API key on our own OmniRoute gateway: pay once, paste it into the app, use it for a sixty-minute session. No account and no subscription.",
};

/**
 * CourseMate is sold as keys, the same way Sage is sold as sessions.
 *
 * The price list is read from the catalog (`plans` where service = 'coursemate'),
 * so an operator re-prices here by editing the plan in the master dashboard and
 * nothing on this page has a price hard-coded.
 */
export default function CourseMateKeysPage() {
  const minutes = coursemateSessionMinutes();
  const plans: CourseMatePlanOption[] = listPlansForService("coursemate").map(
    (plan) => {
      const pub = planPublic(plan);
      return {
        slug: pub.slug,
        name: pub.name,
        description: pub.description,
        pricePerKeyCents: pub.pricePerUnitCents || pub.priceMonthlyCents,
        features: pub.features,
      };
    },
  );

  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              CourseMate
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              One key, one lecture, no account.
            </h1>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              CourseMate runs at{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                cm.innotel.us
              </span>{" "}
              — the app already knows that, so the only thing to buy is the key.
              Pay once and it works for {minutes} minutes — a whole lecture, at
              four times the length of a Sage session — and then it is deleted
              from the gateway.
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
              <li>· Paste it into CourseMate → Settings → API key</li>
              <li>· Works with any OpenAI-compatible client too</li>
              <li>· Endpoint: gateway.innotel.us/v1</li>
              <li>
                · Spend inside the key is capped at{" "}
                {Math.round(COURSEMATE_SPEND_SHARE * 100)}% of its price
              </li>
            </ul>
          </div>

          <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-5 dark:border-white/[0.07] dark:bg-white/[0.02]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              The server the app talks to
            </p>
            <p className="mt-2 font-mono text-sm text-zinc-800 dark:text-zinc-200">
              https://cm.innotel.us
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              Try the key from the command line
            </p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100">
              <code>{`curl -s https://cm.innotel.us/api/health \\
  -H "Authorization: Bearer $COURSEMATE_KEY"`}</code>
            </pre>
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">
              A key answers only while its window is open; anything else is
              refused with 401, which is what the app reports as a bad key.
            </p>
          </div>

          <div className="mt-10">
            <CourseMateKeysClient
              plans={plans}
              minutes={minutes}
              maxKeys={COURSEMATE_MAX_KEYS}
            />
          </div>

          <p className="mt-8 text-xs text-zinc-600 dark:text-zinc-500">
            Payments are processed by Stripe. The key is minted the moment payment
            confirms and shown once on the confirmation page; if you lose it inside
            the window, reload that page rather than paying again.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
