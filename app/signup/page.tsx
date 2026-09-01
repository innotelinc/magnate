import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SignupForm from "@/components/SignupForm";
import { PlayIcon } from "@/components/icons";
import { getPlanBySlug } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { plan: planSlug, interval } = await searchParams;
  const plan = planSlug ? getPlanBySlug(planSlug) : undefined;
  if (!plan || !plan.active) notFound();
  const billing = interval === "year" ? "year" : "month";

  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
          {/* Left: pitch */}
          <div className="animate-fade-up">
            <Link href="/#pricing" className="text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white">
              ← Back to plans
            </Link>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
              Almost there,{" "}
              <span className="text-gradient">let&apos;s get you streaming.</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-zinc-600 dark:text-zinc-400">
              Sign up in seconds. Your account is created the moment your
              payment is confirmed — no waiting.
            </p>

            <div className="mt-10 space-y-4">
              {[
                ["Instant access", "Your account is provisioned automatically."],
                ["Cancel anytime", "No lock-in. Manage everything from one place."],
                ["Account portal", "Reset your password or manage devices anytime from the account portal."],
              ].map(([title, text]) => (
                <div key={title} className="flex gap-4">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/25 to-fuchsia-500/25 text-brand-600 ring-1 ring-zinc-950/10 dark:text-brand-300 dark:ring-white/10">
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
            />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
