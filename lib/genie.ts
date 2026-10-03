/**
 * The Genie preview-subdomain entitlement.
 *
 * Genie serves previews from one wildcard it owns (`*.genie.innotel.us`): an
 * auto address is `p<port>`, free and temporary, and the `genie` plan here is
 * what lets a subscriber hold a *name* of their own instead. This module is the
 * Magnate half — capture the name at checkout, claim it from Genie after the
 * payment is confirmed, and let Genie re-check the entitlement before it grants
 * it (Genie calls back to `/api/entitlements`, so the answer never depends on
 * Magnate having remembered to ask correctly).
 *
 * Nothing here is trusted by Genie on Magnate's say-so: the claim carries the
 * subscriber and Genie verifies it. That keeps one source of truth — the
 * subscription — even though two products are involved.
 */

const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "auth",
  "login",
  "logout",
  "mail",
  "assets",
  "static",
  "localhost",
  "genie",
]);

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** An auto preview address, which is free — so it must not be sellable. */
const AUTO_RE = /^p[0-9]{2,5}$/;

export function geniePreviewDomain(): string {
  return (process.env.GENIE_PREVIEW_DOMAIN || "genie.innotel.us").trim().toLowerCase();
}

/**
 * Normalize a requested label, or return the reason it cannot be sold.
 *
 * The rules are Genie's own (`src/preview.ts`), duplicated here so a bad name is
 * refused at checkout — where the buyer can fix it — rather than after they have
 * paid and the webhook's claim comes back rejected.
 */
export function normalizeGenieSubdomain(raw: string): { name?: string; error?: string } {
  const name = String(raw ?? "").trim().toLowerCase().replace(/\.+$/, "");
  if (name === "") return { error: "A subdomain is required for this plan." };
  if (name.includes(".")) return { error: "Use a single name, e.g. \"acme\" — not a full hostname." };
  if (RESERVED.has(name)) return { error: `"${name}" is reserved.` };
  if (!LABEL_RE.test(name)) {
    return {
      error: "A subdomain must be 1–63 characters of letters, numbers and internal dashes.",
    };
  }
  if (AUTO_RE.test(name)) {
    return { error: "Names like p4001 are free automatic previews — choose your own." };
  }
  return { name };
}

export interface GenieClaimResult {
  ok: boolean;
  /** The full hostname once claimed, for the success page. */
  host?: string;
  error?: string;
}

/** Whether the claim client is configured at all. */
export function genieClaimConfigured(): boolean {
  return Boolean(process.env.GENIE_PREVIEW_API_URL && process.env.GENIE_PREVIEW_CLAIM_TOKEN);
}

/**
 * Claim a subscriber's name from Genie. Best-effort by design: the account is
 * already provisioned by the time this runs, so a Genie that is slow or down
 * must not fail a checkout webhook and make Stripe retry the whole provisioning.
 * A failure is returned (and logged by the caller) rather than thrown.
 */
export async function claimGenieSubdomain(
  name: string,
  user: string,
): Promise<GenieClaimResult> {
  if (!genieClaimConfigured()) {
    return { ok: false, error: "GENIE_PREVIEW_API_URL / GENIE_PREVIEW_CLAIM_TOKEN are not set" };
  }
  const url = process.env.GENIE_PREVIEW_API_URL as string;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GENIE_PREVIEW_CLAIM_TOKEN}`,
      },
      body: JSON.stringify({ name, user }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      preview?: { host?: string };
      error?: string;
    };
    if (!response.ok) {
      return { ok: false, error: payload.error ?? `Genie returned HTTP ${response.status}` };
    }
    return { ok: true, host: payload.preview?.host ?? `${name}.${geniePreviewDomain()}` };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
