import { AndroidIcon, AppleIcon } from "./icons";
import { APP_STORE_URLS } from "@/lib/apps";
import { qrCodeDataUrl } from "@/lib/qr";
import { getBrand } from "@/lib/tenant";

type StoreBadge = "apple" | "google";

const APPS: {
  label: string;
  store: string;
  badgeText: string;
  url: string;
  Icon: typeof AppleIcon;
  badge: StoreBadge;
}[] = [
  {
    label: "iPhone & iPad",
    store: "App Store",
    badgeText: "Download on the App Store",
    url: APP_STORE_URLS.ios,
    Icon: AppleIcon,
    badge: "apple",
  },
  {
    label: "Android",
    store: "Google Play",
    badgeText: "Get it on Google Play",
    url: APP_STORE_URLS.android,
    Icon: AndroidIcon,
    badge: "google",
  },
  {
    label: "Apple TV",
    store: "App Store",
    badgeText: "Download on the App Store",
    url: APP_STORE_URLS.appleTv,
    Icon: AppleIcon,
    badge: "apple",
  },
  {
    label: "Android TV & Fire TV",
    store: "Google Play",
    badgeText: "Get it on Google Play",
    url: APP_STORE_URLS.androidTv,
    Icon: AndroidIcon,
    badge: "google",
  },
];

// Store-badge look-alikes that stay readable in both themes: the App Store
// badge is always dark, the Google Play badge is always light — each gets a
// subtle ring so it doesn't blend into the page background.
const BADGE_CLASSES: Record<StoreBadge, string> = {
  apple:
    "bg-zinc-950 text-white ring-1 ring-inset ring-white/10 hover:bg-zinc-800 dark:ring-white/25",
  google:
    "bg-white text-zinc-950 ring-1 ring-inset ring-zinc-950/15 hover:bg-zinc-100 dark:ring-white/25",
};

export default async function AppsSection() {
  const brand = await getBrand();
  const apps = await Promise.all(
    APPS.map(async (app) => ({ ...app, qr: await qrCodeDataUrl(app.url) })),
  );

  return (
    <section
      id="apps"
      className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Watch on <span className="text-gradient">any screen</span>
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Scan the code or tap a badge to install the Jellyfin app — then
            sign in with your {brand.name} credentials and press play.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {apps.map(({ label, store, badgeText, url, Icon, badge, qr }, i) => (
            <div
              key={label}
              style={{ animationDelay: `${i * 80}ms` }}
              className="animate-fade-up glass flex flex-col items-center rounded-3xl p-6 text-center transition-all duration-300 hover:-translate-y-1"
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-all hover:shadow-md ${BADGE_CLASSES[badge]}`}
              >
                <Icon className="h-4 w-4" />
                {badgeText}
              </a>

              <div className="mt-5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-950/10 dark:ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- QR codes are inline data URLs; next/image cannot optimize them */}
                <img
                  src={qr}
                  alt={`QR code to download the Jellyfin app for ${label}`}
                  width={132}
                  height={132}
                  className="h-[132px] w-[132px]"
                />
              </div>

              <p className="mt-4 font-semibold">{label}</p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-500">
                {store}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
