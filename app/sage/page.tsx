import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SageSessionsClient, {
  type SagePlanOption,
} from "@/components/SageSessionsClient";
import { listPlansForService, planPublic } from "@/lib/plans";
import { SAGE_MAX_SESSIONS, SAGE_SPEND_SHARE } from "@/lib/sage";
import { sageSessionMinutes } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sage sessions — timed gateway keys",
  description:
    "Fifteen minutes of Sage on our own OmniRoute gateway, as many turns as you can use inside the window. Pay per session, no account and no subscription.",
};

/**
 * Sage is sold as sessions, not as a seat or a month.
 *
 * The price list is read from the catalog (`plans` where service = 'sage'), so
 * an operator re-prices here by editing the plan in the master dashboard, and
 * nothing on this page has a price hard-coded.
 */
export default function SageSessionsPage() {
  const minutes = sageSessionMinutes();
  const plans: SagePlanOption[] = listPlansForService("sage").map((plan) => {
    const pub = planPublic(plan);
    return {
      slug: pub.slug,
      name: pub.name,
      description: pub.description,
      pricePerUnitCents: pub.pricePerUnitCents || pub.priceMonthlyCents,
      features: pub.features,
    };
  });

  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              Sage
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              Fifteen minutes of Sage, on our gateway.
            </h1>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              One key, one {minutes}-minute window: start the quiz, the essay or
              the whole problem set inside it and use the key as many times as you
              like. When the window closes the key is deleted from the gateway —
              nothing to cancel, nothing left running.
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
              <li>· Works with any OpenAI-compatible client</li>
              <li>· Endpoint: gateway.innotel.us/v1</li>
              <li>· No account, no subscription, no stored card</li>
              <li>
                · Spend inside the session is capped at{" "}
                {Math.round(SAGE_SPEND_SHARE * 100)}% of its price
              </li>
            </ul>
          </div>

          {/* The base URL and one working call: a buyer with a key and no example
              guesses at the path, so the page shows both. */}
          <div className="mt-8 rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-5 dark:border-white/[0.07] dark:bg-white/[0.02]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              Endpoint
            </p>
            <p className="mt-2 font-mono text-sm text-zinc-800 dark:text-zinc-200">
              https://gateway.innotel.us/v1
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-500">
              Try it with the key from your session
            </p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100">
              <code>{`curl -s https://gateway.innotel.us/v1/chat/completions \\
  -H "Authorization: Bearer $SAGE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto/best-chat",
    "messages": [{ "role": "user", "content": "Explain mitosis in two sentences." }]
  }'`}</code>
            </pre>
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-500">
              Any OpenAI-compatible client works — set the base URL to the
              endpoint above and the session key as the API key. The key answers
              only while its window is open.
            </p>
          </div>

          <div className="mt-10">
            <SageSessionsClient
              plans={plans}
              minutes={minutes}
              maxSessions={SAGE_MAX_SESSIONS}
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
