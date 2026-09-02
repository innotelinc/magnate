import { redirect } from "next/navigation";
import { getAdminToken } from "@/lib/route-auth";
import AdminLogin from "@/components/AdminLogin";
import ThemeToggle from "@/components/ThemeToggle";
import { CrownIcon } from "@/components/icons";
import { getBrand } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const token = await getAdminToken();
  const brand = await getBrand();
  if (token) redirect("/admin");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f7fb] px-4 dark:bg-[#06070c]">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[560px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="animate-fade-up relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/40">
            <CrownIcon className="h-5 w-5 text-white" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">
            Admin panel
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            {brand.name} · sign in to continue
          </p>
        </div>

        <div className="glass rounded-3xl p-7">
          <AdminLogin />
        </div>
      </div>
    </main>
  );
}
