import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getAdminToken } from "@/lib/route-auth";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const token = await getAdminToken();
  if (!token) redirect("/admin/login");

  return (
    <>
      <Nav />
      <main className="min-h-[calc(100vh-4rem)] pb-20">
        <AnalyticsDashboard />
      </main>
    </>
  );
}