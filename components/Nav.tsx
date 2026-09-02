import Link from "next/link";
import { CrownIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";
import { getBrand } from "@/lib/tenant";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export default async function Nav() {
  const brand = await getBrand();
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-950/10 bg-[#f6f7fb]/70 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#06070c]/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-105">
            <CrownIcon className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            {brand.name} <span className="text-gradient">{brand.tagline}</span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-sm text-zinc-600 md:flex dark:text-zinc-400">
          <Link
            href="/#pricing"
            className="transition-colors hover:text-zinc-950 dark:hover:text-white"
          >
            Pricing
          </Link>
          <Link
            href="/#features"
            className="transition-colors hover:text-zinc-950 dark:hover:text-white"
          >
            Features
          </Link>
          <Link
            href="/#about"
            className="transition-colors hover:text-zinc-950 dark:hover:text-white"
          >
            About
          </Link>
          <Link
            href="/#faq"
            className="transition-colors hover:text-zinc-950 dark:hover:text-white"
          >
            FAQ
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href={`${APP_URL}/manage`}
            className="hidden text-sm text-zinc-600 transition-colors hover:text-zinc-950 sm:block dark:text-zinc-400 dark:hover:text-white"
          >
            Manage subscription
          </Link>
          <Link
            href="/#pricing"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 hover:shadow-lg dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 dark:hover:shadow-white/10"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}