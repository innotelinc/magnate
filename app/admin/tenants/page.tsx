import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getAdminToken } from "@/lib/route-auth";
import TenantsPanel from "@/components/TenantsPanel";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const token = await getAdminToken();
  if (!token) redirect("/admin/login");

  return (
    <>
      <Nav />
      <main className="min-h-[calc(100vh-4rem)] pb-20">
        <TenantsPanel />
      </main>
    </>
  );
}