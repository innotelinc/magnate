import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AppsSection from "@/components/AppsSection";
import PricingSection, { type PublicPlan } from "@/components/PricingSection";
import {
  BoltIcon,
  DevicesIcon,
  FilmIcon,
  HeadphonesIcon,
  KeyIcon,
  ShieldIcon,
  UserIcon,
  ArrowRightIcon,
  CheckIcon,
  CreditCardIcon,
  ServerIcon,
} from "@/components/icons";
import { listActivePlans, planPublic } from "@/lib/plans";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export const dynamic = "force-dynamic";

export default async function Home() {
  const plans = listActivePlans().map(planPublic) as PublicPlan[];
  const cheapestPrice =
    Math.min(...plans.map((p) => p.priceMonthlyCents)) / 100;

  const features = [
    {
      icon: FilmIcon,
      title: "Endless library",
      text: "Movies, TV shows, and new releases added every week — all in one place.",
    },
    {
      icon: DevicesIcon,
      title: "Any device",
      text: "Stream on your TV, phone, tablet, laptop, or gaming console. Apps for everything.",
    },
    {
      icon: BoltIcon,
      title: "Blazing fast",
      text: "Direct play with zero buffering on a dedicated server, tuned for performance.",
    },
    {
      icon: ShieldIcon,
      title: "Private & secure",
      text: "Your own private server — no ads, no tracking, no algorithmic noise.",
    },
    {
      icon: HeadphonesIcon,
      title: "Shared with family",
      text: "Multiple simultaneous streams and profiles for everyone in your home.",
    },
    {
      icon: KeyIcon,
      title: "Full control",
      text: "Manage your password and devices anytime through the account portal.",
    },
  ];

  const steps = [
    {
      n: "01",
      title: "Pick a plan",
      text: "Choose monthly or yearly billing and create your username.",
    },
    {
      n: "02",
      title: "Pay securely",
      text: "Checkout is handled by Stripe — cards, Apple Pay and more. Cancel anytime.",
    },
    {
      n: "03",
      title: "Start streaming",
      text: "Your account is created instantly. Sign in on any device and press play.",
    },
  ];

  const faqs = [
    {
      q: "How do I get my login credentials?",
      a: "After your payment succeeds you'll be redirected to a page showing your username and a generated password — save them right away. They're only displayed once.",
    },
    {
      q: "What if I forget my password?",
      a: "Use the account portal at accounts.innotel.us to reset your password at any time.",
    },
    {
      q: "Can I cancel my subscription?",
      a: "Yes — manage or cancel your subscription anytime from the manage page. Access stays active until the end of your billing period.",
    },
    {
      q: "Can I upgrade or downgrade my plan?",
      a: "Absolutely. Open the billing portal from the manage page to switch plans. Price changes are prorated automatically.",
    },
    {
      q: "Which devices are supported?",
      a: "Jellyfin has apps for Android, iOS, Apple TV, Android TV, Roku, Fire TV, web browsers, and more. Any modern device can stream.",
    },
    {
      q: "Do you offer refunds?",
      a: "You can cancel anytime. For billing issues, reach out to the admin and we'll sort it out.",
    },
  ];

  return (
    <>
      <Nav />
      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[130px]" />
          <div className="pointer-events-none absolute top-40 right-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-600/15 blur-[110px] animate-float-slow" />

          <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
            <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-zinc-950/10 bg-black/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 dark:bg-emerald-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              </span>
              Server online · Streaming in 4K
            </span>

            <h1 className="animate-fade-up delay-100 mt-8 text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
              Your media,
              <br />
              <span className="text-gradient">everywhere you are.</span>
            </h1>

            <p className="animate-fade-up delay-200 mx-auto mt-6 max-w-xl text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
              Stream movies, shows and more on any device with a private,
              ad-free Jellyfin server. Plans start at just{" "}
              <span className="font-semibold text-zinc-950 dark:text-white">
                ${cheapestPrice % 1 === 0 ? cheapestPrice.toFixed(0) : cheapestPrice.toFixed(2)}
                /mo
              </span>
              .
            </p>

            <div className="animate-fade-up delay-300 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/#pricing"
                className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-indigo-500/30 transition-all hover:shadow-indigo-500/50 hover:brightness-110"
              >
                View plans
                <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href={`${APP_URL}/manage`}
                className="rounded-full border border-zinc-950/15 bg-black/[0.04] px-8 py-3.5 text-base font-medium text-zinc-950 transition-all hover:border-zinc-950/30 hover:bg-black/[0.06] dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:border-white/30 dark:hover:bg-white/[0.08]"
              >
                Manage subscription
              </Link>
            </div>

            {/* Stats */}
            <div className="animate-fade-up delay-500 mx-auto mt-16 grid max-w-lg grid-cols-3 gap-6 border-t border-zinc-950/10 pt-8 dark:border-white/[0.06]">
              {[
                ["4K HDR", "quality"],
                ["0", "ads & tracking"],
                ["24/7", "uptime"],
              ].map(([a, b]) => (
                <div key={b}>
                  <p className="text-2xl font-bold">{a}</p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-500">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <PricingSection plans={plans} />

        {/* FEATURES */}
        <section id="features" className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Everything you need.{" "}
                <span className="text-gradient">Nothing you don&apos;t.</span>
              </h2>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }, i) => (
                <div
                  key={title}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className="animate-fade-up group rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/50 hover:bg-black/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-brand-600 ring-1 ring-zinc-950/10 transition-transform duration-300 group-hover:scale-110 dark:text-brand-300 dark:ring-white/10">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-zinc-950/10 py-24 dark:border-white/[0.06]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Streaming in <span className="text-gradient">3 steps</span>
              </h2>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {steps.map((step, i) => (
                <div key={step.n} className="relative">
                  {i < steps.length - 1 && (
                    <div className="absolute left-full top-10 hidden h-px w-full -translate-x-1/2 bg-gradient-to-r from-zinc-950/15 to-transparent md:block dark:from-white/20" />
                  )}
                  <div className="rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-7 transition-all duration-300 hover:border-zinc-950/25 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/20">
                    <span className="text-gradient text-4xl font-bold">
                      {step.n}
                    </span>
                    <h3 className="mt-4 flex items-center gap-2 text-lg font-semibold">
                      <UserIcon className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {step.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* APPS */}
        <AppsSection />

        {/* ABOUT */}
        <section
          id="about"
          className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <div className="animate-fade-up">
                <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  About <span className="text-gradient">Innotel Media</span>
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-zinc-800 dark:text-zinc-300">
                  Innotel Media is a private streaming service run on our own
                  self-hosted Jellyfin server — no ads, no tracking, no
                  algorithmic noise. Just the movies and shows you want, in
                  quality up to 4K HDR.
                </p>
                <p className="mt-4 leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Every account is created and managed on our own
                  infrastructure: payments are handled securely by Stripe,
                  subscriptions are managed from one place, and passwords can
                  be reset anytime through the account portal. Because the
                  server is ours, your data stays with us — and so does the
                  speed.
                </p>

                <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                  {[
                    "Private & ad-free streaming",
                    "Self-hosted & family-friendly",
                    "Secure Stripe payments",
                    "Works on every device",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 text-sm text-zinc-800 dark:text-zinc-300"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400 dark:ring-emerald-400/30">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: ServerIcon,
                    title: "Self-hosted",
                    text: "Runs on our dedicated Jellyfin server, tuned for direct play and zero buffering.",
                  },
                  {
                    icon: ShieldIcon,
                    title: "Private by design",
                    text: "No ads, no tracking, no selling your data. Just your library, your rules.",
                  },
                  {
                    icon: CreditCardIcon,
                    title: "Simple billing",
                    text: "Monthly or yearly plans billed securely through Stripe. Cancel anytime.",
                  },
                  {
                    icon: HeadphonesIcon,
                    title: "Real support",
                    text: "Reset passwords in the account portal, or request movies & shows via Jellyseerr.",
                  },
                ].map(({ icon: Icon, title, text }, i) => (
                  <div
                    key={title}
                    style={{ animationDelay: `${i * 80}ms` }}
                    className="animate-fade-up group rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/50 hover:bg-black/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-brand-600 ring-1 ring-zinc-950/10 transition-transform duration-300 group-hover:scale-110 dark:text-brand-300 dark:ring-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Frequently asked <span className="text-gradient">questions</span>
              </h2>
            </div>
            <div className="mt-12 space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group rounded-2xl border border-zinc-950/10 bg-black/[0.02] transition-colors open:border-zinc-950/20 open:bg-black/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:open:border-white/20 dark:open:bg-white/[0.04]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-950/20 text-zinc-600 transition-transform duration-300 group-open:rotate-45 dark:border-white/15 dark:text-zinc-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="px-6 pb-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-zinc-950/10 bg-gradient-to-br from-indigo-600/20 via-violet-600/10 to-fuchsia-600/20 p-10 text-center sm:p-16 dark:border-white/10">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[480px] -translate-x-1/2 rounded-full bg-indigo-500/30 blur-[100px]" />
              <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to start watching?
              </h2>
              <p className="relative mx-auto mt-3 max-w-md text-zinc-800 dark:text-zinc-300">
                Join today and stream instantly. Cancel whenever you like —
                no questions asked.
              </p>
              <Link
                href="/#pricing"
                className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-950 px-8 py-3.5 text-base font-semibold text-white transition-all hover:shadow-xl hover:shadow-zinc-950/20 dark:bg-white dark:text-zinc-900 dark:hover:shadow-white/20"
              >
                Choose a plan
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
