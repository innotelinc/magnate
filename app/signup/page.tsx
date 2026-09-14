import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SignupForm from "@/components/SignupForm";
import { PlayIcon } from "@/components/icons";
import { getPlanBySlug } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Per-service pitch for the shared signup page.
 *
 * This page sells more than one service's plans (Monarch's memberships, Zeus's
 * voice-agents add-on), so the copy has to follow `plans.service` — the column
 * the master dashboard sets. "let's get you streaming" is simply wrong on a
 * phone bill, and it pointed buyers at the streaming service instead of the one
 * they were actually buying.
 */
const SERVICE_PITCH: Record<
  string,
  { lead: string; sub: string; back: string; backHref: string }
> = {
  zeus: {
    lead: "let's get you talking.",
    sub: "Add AI voice agents to your Zeus number — they answer your calls, take messages and route callers. Billed monthly with your phone plan, on one bill.",
    back: "Back to Zeus plans",
    backHref: "https://subscribe.zeus.innotel.us",
  },
  monarch: {
    lead: "let's get you streaming.",
    sub: "Sign up in seconds. Your account is created the moment your payment is confirmed — no waiting.",
    back: "Back to plans",
    backHref: "/#pricing",
  },
};

const DEFAULT_PITCH = {
  lead: "let's get you set up.",
  sub: "Sign up in seconds. Your account is created the moment your payment is confirmed — no waiting.",
  back: "Back to plans",
  backHref: "/#pricing",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string; ref?: string }>;
}) {
  const { plan: planSlug, interval, ref } = await searchParams;
  const plan = planSlug ? getPlanBySlug(planSlug) : undefined;
  if (!plan || !plan.active) notFound();
  const billing = interval === "year" ? "year" : "month";
  const refCode = ref?.trim().slice(0, 24) || null;
  const pitch = SERVICE_PITCH[(plan.service ?? "").toLowerCase()] ?? DEFAULT_PITCH;

  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
          {/* Left: pitch */}
          <div className="animate-fade-up">
            <Link href={pitch.backHref} className="text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white">
              ← {pitch.back}
            </Link>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
              Almost there,{" "}
              <span className="text-gradient">{pitch.lead}</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-zinc-600 dark:text-zinc-400">
              {pitch.sub}
            </p>

            <div className="mt-10 space-y-4">
              {[
                ["Instant access", "Your account is provisioned automatically."],
                ["Cancel anytime", "No lock-in. Manage everything from one place."],
                ["Account portal", "Reset your password or manage devices anytime from the account portal."],
              ].map(([title, text]) => (
                <div key={title} className="flex gap-4">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600 ring-1 ring-zinc-950/10 dark:text-brand-300 dark:ring-white/10">
                    <PlayIcon className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-500">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: form card */}
          <div className="animate-fade-up delay-200 glass rounded-3xl p-7 sm:p-9">
            <SignupForm
              plan={{
                name: plan.name,
                slug: plan.slug,
                priceMonthlyCents: plan.price_monthly_cents,
                priceYearlyCents: plan.price_yearly_cents,
              }}
              interval={billing}
              refCode={refCode}
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
