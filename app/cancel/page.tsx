import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function CancelPage() {
  return (
    <>
      <Nav />
      <main className="relative flex flex-1 items-center overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-zinc-500/10 blur-[120px]" />
        <div className="relative mx-auto w-full max-w-md px-4 py-16 text-center sm:px-6">
          <div className="animate-pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-zinc-950/15 bg-black/[0.04] text-3xl dark:border-white/15 dark:bg-white/[0.04]">
            🚫
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            Checkout cancelled
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            No charges were made. Your streaming adventure is one click away
            whenever you&apos;re ready.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/#pricing"
              className="rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110"
            >
              Back to plans
            </Link>
            <Link
              href="/"
              className="rounded-full border border-zinc-950/15 px-7 py-3 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
            >
              Home
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
