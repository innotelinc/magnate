import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import SuccessClient from "@/components/SuccessClient";
import SageSuccessClient from "@/components/SageSuccessClient";
import { accountPortalUrl, jellyfinUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; kind?: string }>;
}) {
  const { session_id, kind } = await searchParams;
  // A Sage purchase has no account and no password: what it delivers is a
  // gateway key with a fifteen-minute life, so it gets its own reveal.
  const isSage = kind === "sage";
  return (
    <>
      <Nav />
      <main className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[600px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-4 py-14 sm:px-6">
          {isSage ? (
            <SageSuccessClient
              sessionId={session_id ?? null}
              sageUrl={process.env.SAGE_APP_URL || "https://sage.innotel.tech"}
            />
          ) : (
            <SuccessClient
              sessionId={session_id ?? null}
              jellyfinUrl={jellyfinUrl()}
              accountPortalUrl={accountPortalUrl()}
              requestUrl={process.env.REQUEST_URL || "https://req.magnate.innotel.us"}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
