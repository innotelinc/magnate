/**
 * The Zeus phone-plan entitlement: the number the purchase buys.
 *
 * Zeus sells a phone plan (slug `phone`, `service = "zeus"`) whose whole
 * deliverable is a line — "your own number with calls, SMS, fax and voicemail".
 * Magnate can provision the *account* (Authentik is the identity store), but only
 * Zeus holds the PBX: the number pool, the VoIP.ms account and the portal rows.
 * So this module is the Magnate half — after a Zeus-service subscription is live,
 * ask Zeus to assign a number, and let Zeus decide which one.
 *
 * Nothing here is trusted by Zeus on Magnate's say-so. The call carries an
 * address, not a number: Zeus allocates from its own pool, refuses to give out a
 * line the PBX trunk routes, and answers with the number it actually assigned
 * (see `src/lib/phone-provisioning.ts`). Magnate stores that answer and shows it
 * on the success page, and a repeat call returns the same line rather than a
 * second one — which is what makes this safe to run from a webhook Stripe
 * retries.
 *
 * Best-effort by design, like the Genie claim: the account is already
 * provisioned when this runs, so a Zeus that is slow or down must not fail the
 * checkout webhook and make Stripe replay the whole thing. A failure is returned
 * (and recorded on the user) rather than thrown — the plan is still billed and
 * the operator can see, in the admin panel, that the number is missing.
 */

export const ZEUS_SERVICE = "zeus";

/** Whether a plan's `service` column is the Zeus funnel. */
export function isZeusService(service: string | null | undefined): boolean {
  return (service ?? "").trim().toLowerCase() === ZEUS_SERVICE;
}

export interface ZeusProvisionResult {
  ok: boolean;
  /** The line Zeus assigned, once it has. */
  number?: string;
  /** The line's area code, as Zeus resolved it. */
  areaCode?: string | null;
  error?: string;
}

/** Whether the provisioning client is configured at all. */
export function zeusProvisionConfigured(): boolean {
  return Boolean(process.env.ZEUS_PROVISION_URL && process.env.ZEUS_PROVISION_TOKEN);
}

/**
 * Ask Zeus to assign a number to `email`'s portal account, creating that account
 * if the buyer has never signed in.
 *
 * The token is scoped `numbers:provision` on Zeus and is the only kind that may
 * name the account it acts on, because a purchase is the one case where the
 * account does not exist yet.
 */
export async function provisionZeusNumber(input: {
  email: string;
  plan?: string | null;
  areaCode?: string | null;
}): Promise<ZeusProvisionResult> {
  if (!zeusProvisionConfigured()) {
    return {
      ok: false,
      error: "ZEUS_PROVISION_URL / ZEUS_PROVISION_TOKEN are not set",
    };
  }

  const url = process.env.ZEUS_PROVISION_URL as string;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ZEUS_PROVISION_TOKEN}`,
      },
      body: JSON.stringify({
        email: input.email,
        ...(input.plan ? { plan: input.plan } : {}),
        ...(input.areaCode ? { area_code: input.areaCode } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      did?: string;
      area_code?: string | null;
      error?: string;
      number_assigned?: boolean;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: payload.error ?? `Zeus returned HTTP ${response.status}`,
      };
    }
    if (!payload.did) {
      return { ok: false, error: "Zeus answered without a number" };
    }
    return {
      ok: true,
      number: payload.did,
      areaCode: payload.area_code ?? null,
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
