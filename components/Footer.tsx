import Link from "next/link";
import { PlayIcon } from "./icons";
import { jellyfinUrl } from "@/lib/settings";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const JELLYFIN_URL = jellyfinUrl();
const JFA_GO_URL = process.env.JFA_GO_URL || "https://accounts.innotel.us";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500">
                <PlayIcon className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="font-semibold">
                Innotel <span className="text-gradient">Media</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-zinc-500">
              Unlimited streaming for you and your family. Cancel anytime.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4 text-sm">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-zinc-300">Stream</span>
              <a
                href={JELLYFIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 transition-colors hover:text-white"
              >
                Jellyfin server
              </a>
              <Link href={`${APP_URL}/manage`} className="text-zinc-500 transition-colors hover:text-white">
                Manage subscription
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-zinc-300">Account</span>
              <a
                href={JFA_GO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 transition-colors hover:text-white"
              >
                Account portal
              </a>
              <Link href={`${APP_URL}/admin`} className="text-zinc-500 transition-colors hover:text-white">
                Admin
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/[0.06] pt-6 text-xs text-zinc-600">
          © {new Date().getFullYear()} Innotel Media. Payments processed securely
          by Stripe.
        </div>
      </div>
    </footer>
  );
}
