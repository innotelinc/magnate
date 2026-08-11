import Stripe from "stripe";
import { stripeSecretKey, stripeCurrency as getCurrency } from "./settings";

let _stripe: Stripe | null = null;
let _stripeKey: string | undefined;

export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  // Re-create client if the key changed (e.g. admin updated it).
  if (!_stripe || key !== _stripeKey) {
    _stripe = new Stripe(key);
    _stripeKey = key;
  }
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

export function stripeCurrency(): string {
  return getCurrency();
}
