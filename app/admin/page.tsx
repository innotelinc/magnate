import Link from "next/link";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getAdminToken } from "@/lib/route-auth";
import AdminDashboard from "@/components/AdminDashboard";
import { ChartIcon, BuildingIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const token = await getAdminToken();
  if (!token) redirect("/admin/login");

  return (
    <>
      <Nav />
      <main className="min-h-[calc(100vh-4rem)] pb-20">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pt-6 sm:px-6">
          <Link
            href="/admin/analytics"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
          >
            <ChartIcon className="h-4 w-4" />
            Analytics
          </Link>
          <Link
            href="/admin/tenants"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
          >
            <BuildingIcon className="h-4 w-4" />
            Tenants
          </Link>
        </div>
        <AdminDashboard />
      </main>
    </>
  );
}