/**
 * Multi-tenant & white-label resolution.
 *
 * Every incoming request is mapped to a tenant by Host header. A tenant is a
 * branded instance (name, tagline, description, footer note) bound to one or
 * more domains. The seeded "magnate" tenant owns the platform's own domains;
 * extra tenants let creators/orgs run white-labelled copies.
 */

import { headers } from "next/headers";
import { db, parseTenantDomains, type Tenant } from "./db";

const DEFAULT_SLUG = "magnate";

/* ---------- data access ---------- */

export function listTenants(): Tenant[] {
  return db.prepare("SELECT * FROM tenants ORDER BY name, id").all() as Tenant[];
}

export function getTenantById(id: number): Tenant | undefined {
  return db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as
    | Tenant
    | undefined;
}

export function getTenantBySlug(slug: string): Tenant | undefined {
  return db.prepare("SELECT * FROM tenants WHERE slug = ?").get(slug) as
    | Tenant
    | undefined;
}

export function getDefaultTenant(): Tenant {
  return (
    getTenantBySlug(DEFAULT_SLUG) ??
    (db.prepare("SELECT * FROM tenants ORDER BY id LIMIT 1").get() as
      | Tenant
      | undefined)!
  );
}

/** Map a Host header value to a tenant, falling back to the default tenant. */
export function resolveTenantByHost(host: string | null | undefined): Tenant {
  const h = (host ?? "").toLowerCase().split(":")[0].trim();
  const tenants = listTenants();
  for (const tenant of tenants) {
    if (!tenant.active) continue;
    const domains = parseTenantDomains(tenant);
    for (const domain of domains) {
      if (domain === h) return tenant;
      // Allow "*.example.com" entries to cover subdomains.
      if (domain.startsWith("*.") && h.endsWith(domain.slice(1))) {
        return tenant;
      }
    }
  }
  return getDefaultTenant();
}

/* ---------- cached per-request resolution ---------- */

const cache = new Map<string, { at: number; tenant: Tenant }>();
const CACHE_TTL_MS = 30_000;

/** Resolve the tenant for the current request (server components only). */
export async function resolveTenant(): Promise<Tenant> {
  let host: string | null = null;
  try {
    const h = await headers();
    host = h.get("host");
  } catch {
    // headers() is unavailable outside a request context (build time, API
    // routes that opt out). Fall through to the default tenant.
  }
  const key = (host ?? "").toLowerCase() || DEFAULT_SLUG;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tenant;
  const tenant = resolveTenantByHost(host);
  cache.set(key, { at: Date.now(), tenant });
  return tenant;
}

/* ---------- brand model for UI ---------- */

export interface Brand {
  name: string;
  tagline: string;
  description: string;
  footerNote: string;
}

export function brandFromTenant(tenant: Tenant): Brand {
  return {
    name: tenant.name || "Magnate",
    tagline: tenant.tagline || "Subscription Platform",
    description:
      tenant.description ||
      "A premium self-hosted subscription and streaming platform.",
    footerNote: tenant.footer_note || "Payments processed securely by Stripe.",
  };
}

/** Brand for the current request (server components only). */
export async function getBrand(): Promise<Brand> {
  return brandFromTenant(await resolveTenant());
}