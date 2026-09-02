import Link from "next/link";
import { AndroidIcon, AppleIcon, CrownIcon } from "./icons";
import { accountPortalUrl, jellyfinUrl } from "@/lib/settings";
import { APP_STORE_URLS } from "@/lib/apps";
import { getBrand } from "@/lib/tenant";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const JELLYFIN_URL = jellyfinUrl();
const PORTAL_URL = accountPortalUrl();

export default async function Footer() {
  const brand = await getBrand();
  return (
    <footer className="border-t border-zinc-950/10 bg-zinc-950/[0.03] dark:border-white/[0.06] dark:bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500">
                <CrownIcon className="h-3.5 w-3.5 text-white" />
              </span>
              <span className="font-semibold">
                {brand.name} <span className="text-gradient">{brand.tagline}</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-zinc-600 dark:text-zinc-500">
              Unlimited streaming for you and your family. Cancel anytime.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4 text-sm">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-zinc-800 dark:text-zinc-300">
                Stream
              </span>
              <a
                href={JELLYFIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                Jellyfin server
              </a>
              <a
                href={APP_STORE_URLS.ios}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                <AppleIcon className="h-4 w-4" />
                iOS app
              </a>
              <a
                href={APP_STORE_URLS.android}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                <AndroidIcon className="h-4 w-4" />
                Android app
              </a>
              <a
                href={APP_STORE_URLS.appleTv}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                <AppleIcon className="h-4 w-4" />
                Apple TV app
              </a>
              <a
                href={APP_STORE_URLS.androidTv}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                <AndroidIcon className="h-4 w-4" />
                Android TV app
              </a>
              <Link
                href={`${APP_URL}/manage`}
                className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                Manage subscription
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-zinc-800 dark:text-zinc-300">
                Account
              </span>
              <a
                href={PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                Account portal
              </a>
              <Link
                href={`${APP_URL}/admin`}
                className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-white"
              >
                Admin
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-950/10 pt-6 text-xs text-zinc-500 dark:border-white/[0.06] dark:text-zinc-600">
          © {new Date().getFullYear()} {brand.name}. {brand.footerNote}
        </div>
      </div>
    </footer>
  );
}