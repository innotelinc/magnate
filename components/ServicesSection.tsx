import {
  ArrowRightIcon,
  BoltIcon,
  DevicesIcon,
  FilmIcon,
  GlobeIcon,
  HeadphonesIcon,
  ShieldIcon,
  ServerIcon,
} from "./icons";

/**
 * Every stack in the platform that Magnate bills for. One account, one
 * invoice — services are grouped by what they do rather than by hostname.
 * URLs are the public edge hosts (NPM) for each product.
 */
const SERVICES: {
  name: string;
  tag: string;
  text: string;
  url: string;
  cta: string;
  Icon: typeof FilmIcon;
}[] = [
  {
    name: "Monarch",
    tag: "Media streaming",
    text: "Private Jellyfin streaming for the household — movies, shows, live TV and DVR, requests and downloads, all managed under one membership.",
    url: "https://media.magnate.innotel.us",
    cta: "Open Jellyfin",
    Icon: FilmIcon,
  },
  {
    name: "Zeus",
    tag: "Voice & PBX",
    text: "Phone numbers, SMS, fax and voicemail on the Zeus PBX, with WebRTC softphones — and AI voice agents by Capstone as an add-on sold from the Zeus page.",
    url: "https://subscribe.zeus.innotel.us",
    cta: "See Zeus plans",
    Icon: HeadphonesIcon,
  },
  {
    name: "Onyx",
    tag: "OSS platform",
    text: "Self-hosted operations platform for projects and deployments. Plans and seat entitlements flow through Magnate.",
    url: "https://app.onyx.innotel.us",
    cta: "Open Onyx",
    Icon: ServerIcon,
  },
  {
    name: "Rizz Aura",
    tag: "Social & dating",
    text: "Consumer app with one-off purchases (aura slots, boosts) settled through Magnate's Stripe ledger.",
    url: "https://rizz.innotel.us",
    cta: "Open Rizz Aura",
    Icon: BoltIcon,
  },
  {
    name: "Oasis",
    tag: "Mail & collaboration",
    text: "Self-hosted Zimbra mail, files and calendar. Mailbox subscriptions are billed as Magnate memberships.",
    url: "https://oasis.innotel.us",
    cta: "Open Oasis",
    Icon: GlobeIcon,
  },
  {
    name: "ZapIt",
    tag: "Short links",
    text: "Fast link shortening with usage-based tiers billed through the same account as everything else.",
    url: "https://zapp.innotel.us",
    cta: "Open ZapIt",
    Icon: DevicesIcon,
  },
  {
    name: "Cerulean",
    tag: "Identity & trust",
    text: "The auth and security stack behind every service above — one Cerulean login unlocks all Magnate-billed products. Included free with any membership.",
    url: "https://auth.cerulean.innotel.us",
    cta: "Sign in with Cerulean",
    Icon: ShieldIcon,
  },
];

export default function ServicesSection() {
  return (
    <section
      id="services"
      className="scroll-mt-20 border-t border-zinc-950/10 py-24 dark:border-white/[0.06]"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-black/[0.04] px-3 py-1 text-xs font-medium text-brand-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-brand-300">
            <ServerIcon className="h-3.5 w-3.5" />
            The whole platform, one bill
          </span>
          <h2 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            One account. <span className="text-gradient">Every service.</span>
          </h2>
          <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
            Magnate is the billing platform for the entire stack. Your
            membership covers media, voice, mail, and everything else —
            sign in once with Cerulean and go.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ name, tag, text, url, cta, Icon }, i) => (
            <div
              key={name}
              style={{ animationDelay: `${i * 70}ms` }}
              className="animate-fade-up group flex flex-col rounded-2xl border border-zinc-950/10 bg-black/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-950/25 hover:bg-black/[0.04] dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.04] text-brand-600 ring-1 ring-zinc-950/10 transition-transform duration-300 group-hover:scale-110 dark:bg-white/[0.04] dark:text-brand-300 dark:ring-white/10">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold leading-tight">{name}</h3>
                  <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                    {tag}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {text}
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
              >
                {cta}
                <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
