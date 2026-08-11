import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ManageForm from "@/components/ManageForm";
import { LockIcon, UserIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function ManagePage() {
  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
          <div className="animate-fade-up">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Manage your{" "}
              <span className="text-gradient">subscription</span>
            </h1>
            <p className="mt-4 max-w-md text-lg text-zinc-600 dark:text-zinc-400">
              Upgrade, downgrade, update your payment method or cancel — all
              handled securely in the Stripe billing portal.
            </p>

            <div className="mt-10 space-y-4">
              <div className="flex gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 ring-1 ring-zinc-950/10 dark:text-brand-300 dark:ring-white/10">
                  <LockIcon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium">Password & devices</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-500">
                    For Jellyfin account settings (password, devices), head to{" "}
                    <a
                      href={process.env.JFA_GO_URL || "https://accounts.innotel.us"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
                    >
                      accounts.innotel.us
                    </a>
                    .
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 ring-1 ring-zinc-950/10 dark:text-emerald-300 dark:ring-white/10">
                  <UserIcon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium">Billing</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-500">
                    Invoices, payment methods and plan changes are managed via
                    Stripe&apos;s billing portal.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="animate-fade-up delay-200 glass rounded-3xl p-7 sm:p-9">
            <h2 className="text-xl font-semibold">Billing portal</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Enter the email you subscribed with and we&apos;ll take you to your
              billing dashboard.
            </p>
            <div className="mt-6">
              <ManageForm />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
