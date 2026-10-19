/**
 * The Oasis mail-plan entitlement: the mailbox the purchase buys.
 *
 * Oasis (MailOps) sells mail at the buyer's own domain — a plan whose `service`
 * is `oasis` is "your domain, with mail on it". Magnate owns the billing decision
 * and the account; it does **not** own a nameserver, a certificate authority or a
 * mailbox store, and it must not hold a Stalwart, Authentik or resolver
 * credential to deliver one (see docs/stack.md: trust is Cerulean's, identity is
 * Authentik's, mail is Oasis's).
 *
 * So this module holds a single **Cerulean** service key and makes a single call
 * — `POST /api/service/tenants` — which registers the buyer's zone, mints the
 * mail domain with its DKIM keys, publishes its DNS, and creates the first
 * mailbox. Cerulean makes the mail half happen by asking Oasis and forwarding
 * this key, so the mail host adjudicates it against Cerulean
 * (`GET /api/service/whoami`) rather than against a list of its own: revoking the
 * key here is immediate everywhere, with no second list to drift.
 *
 * Idempotent by design, because the caller is a Stripe webhook that Stripe will
 * retry: a second call finds the tenant already built and answers `existed: true`
 * with no new password, rather than a second domain or a second mailbox. The
 * password comes back only from the call that created the account — a caller that
 * loses it rotates instead of re-provisioning.
 *
 * Best-effort, like the Zeus number and the Genie claim: the subscription is
 * already billed when this runs, so a Cerulean that is slow or down must not fail
 * the checkout webhook. A failure is returned (and recorded on the user) rather
 * than thrown — the operator can retry from the admin panel.
 */

export const OASIS_SERVICE = "oasis";

/** The metadata keys a checkout may carry the mail domain on, in order. */
export const DOMAIN_METADATA_KEYS = ["mag_domain", "domain", "mail_domain"] as const;

/** Whether a plan's `service` column is the mail funnel. */
export function isOasisService(service: string | null | undefined): boolean {
  return (service ?? "").trim().toLowerCase() === OASIS_SERVICE;
}

/** The bridge's base URL, without a trailing slash. */
function ceruleanApiBase(): string {
  return (process.env.CERULEAN_API_URL ?? "").trim().replace(/\/+$/, "");
}

/** Whether the provisioning client is configured at all. */
export function oasisMailProvisionConfigured(): boolean {
  return Boolean(process.env.CERULEAN_SERVICE_KEY && ceruleanApiBase());
}

/**
 * The domain a purchase is for.
 *
 * A mail plan is only meaningful with a domain, and the checkout is where the
 * buyer names it: the platform selling the plan puts it in the session metadata,
 * the same way a Genie purchase carries its subdomain. Without one there is
 * nothing to provision, and saying so beats inventing a domain from the buyer's
 * address — `@gmail.com` is not a tenant.
 */
export function mailDomainFromMetadata(
  metadata: Record<string, string> | null | undefined,
): string | null {
  for (const key of DOMAIN_METADATA_KEYS) {
    const raw = (metadata?.[key] ?? "").trim().toLowerCase().replace(/\.$/, "");
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw)
        && raw.includes(".")) {
      return raw;
    }
  }
  return null;
}

/**
 * The first mailbox of a purchased domain.
 *
 * A plan sells mail on a domain, not a specific person: when the buyer's own
 * address is on that domain it *is* the mailbox they bought (and the one write
 * merges their groups into the identity they already sign in with). Otherwise
 * the tenant gets `postmaster`, which every domain is expected to answer, and the
 * owner adds the rest from Oasis.
 */
export function firstMailboxFor(domain: string, buyerEmail?: string | null): string {
  const address = (buyerEmail ?? "").trim().toLowerCase();
  if (address.endsWith(`@${domain}`)) return address;
  return `postmaster@${domain}`;
}

export interface MailTenantResult {
  ok: boolean;
  /** The domain the tenant was built on; Cerulean's spelling of it. */
  domain?: string;
  /** True when this call registered the zone. */
  created?: boolean;
  /** True when the mail half was already there (a retry). */
  existed?: boolean;
  /** The first account's address. */
  email?: string;
  /** The one-time password, only from the call that created the account. */
  password?: string | null;
  error?: string;
}

/**
 * Ask Cerulean to build the tenant the purchase bought.
 *
 * Cerulean is the only caller of the mail host, so this is the whole
 * integration: one request, one credential, and the answer says what exists.
 */
export async function provisionMailTenant(input: {
  domain: string;
  email: string;
  name?: string | null;
  groups?: string[];
  description?: string | null;
}): Promise<MailTenantResult> {
  if (!oasisMailProvisionConfigured()) {
    return {
      ok: false,
      error: "CERULEAN_API_URL / CERULEAN_SERVICE_KEY are not set",
    };
  }

  try {
    const response = await fetch(`${ceruleanApiBase()}/service/tenants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CERULEAN_SERVICE_KEY as string}`,
      },
      body: JSON.stringify({
        domain: input.domain,
        email: input.email,
        ...(input.name ? { name: input.name } : {}),
        ...(input.groups?.length ? { groups: input.groups } : {}),
        ...(input.description ? { description: input.description } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      domain?: { name?: string; created?: boolean };
      mail?: {
        domain?: { domain?: string };
        account?: { email?: string };
        existed?: boolean;
        password?: string | null;
      };
    };

    if (!response.ok) {
      // A 502 carries Cerulean's own words about the mail hop, and the zone it
      // already registered; either way the caller has to know it failed.
      return {
        ok: false,
        domain: input.domain,
        error: payload.error ?? `Cerulean returned HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      domain: payload.mail?.domain?.domain ?? payload.domain?.name ?? input.domain,
      created: payload.domain?.created ?? false,
      existed: payload.mail?.existed ?? false,
      email: payload.mail?.account?.email ?? input.email,
      password: payload.mail?.password ?? null,
    };
  } catch (error) {
    return { ok: false, domain: input.domain, error: (error as Error).message };
  }
}
