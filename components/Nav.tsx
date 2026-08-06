import Link from "next/link";
import { PlayIcon } from "./icons";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#06070c]/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30 transition-transform duration-300 group-hover:scale-105">
            <PlayIcon className="h-4 w-4 text-white" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Innotel <span className="text-gradient">Media</span>
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          <Link href="/#pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
          <Link href="/#features" className="transition-colors hover:text-white">
            Features
          </Link>
          <Link href="/#faq" className="transition-colors hover:text-white">
            FAQ
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`${APP_URL}/manage`}
            className="hidden text-sm text-zinc-400 transition-colors hover:text-white sm:block"
          >
            Manage subscription
          </Link>
          <Link
            href="/#pricing"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition-all hover:bg-zinc-200 hover:shadow-lg hover:shadow-white/10"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
