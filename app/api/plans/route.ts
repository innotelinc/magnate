import { NextResponse } from "next/server";
import { listPlansForService, listStorefrontPlans, planPublic } from "@/lib/plans";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept",
};

/**
 * Public price list, consumed by each service's subscribe page:
 *
 *   GET /api/plans                 → the platform membership (the storefront)
 *   GET /api/plans?service=zeus    → the plans priced for that service
 *
 * A service with no plan yet returns an empty list — its page renders "not
 * sold here yet" rather than a price. No auth: prices are public, checkout
 * itself is gated by the signup flow.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const service = (searchParams.get("service") ?? "").trim().toLowerCase();

  // No ?service= → the generic platform membership (what the storefront grid
  // sells). With ?service=<slug> → that service's own price list; a service
  // with no plan returns an empty list, never another service's prices.
  const plans = service
    ? listPlansForService(service)
    : listStorefrontPlans();

  return NextResponse.json(
    { service: service || "generic", plans: plans.map(planPublic) },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
