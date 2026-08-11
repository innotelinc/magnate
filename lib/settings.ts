/**
 * Key-value settings store backed by the SQLite database.
 * Database values take precedence over environment variables so the admin
 * panel can override the initial env-var configuration at runtime.
 */

import { db } from "./db";

/* ---------- env-var fallback map ---------- */

const ENV_FALLBACKS: Record<string, string | undefined> = {
  stripe_secret_key: process.env.STRIPE_SECRET_KEY,
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  stripe_currency: process.env.STRIPE_CURRENCY,
  jellyfin_url: process.env.JELLYFIN_URL,
  jellyfin_api_key: process.env.JELLYFIN_API_KEY,
  admin_password: process.env.ADMIN_PASSWORD,
};

/* ---------- public API ---------- */

/** Get a setting value. DB wins; falls back to env. */
export function getSetting(key: string): string | undefined {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (row !== undefined) return row.value;
  return ENV_FALLBACKS[key];
}

/** Set a setting value in the database (upsert). */
export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

/** Delete a setting so the env-var fallback is exposed again. */
export function deleteSetting(key: string): void {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/* ---------- typed convenience getters ---------- */

export function stripeSecretKey(): string | undefined {
  return getSetting("stripe_secret_key");
}

export function stripeWebhookSecret(): string | undefined {
  return getSetting("stripe_webhook_secret");
}

export function stripeCurrency(): string {
  return getSetting("stripe_currency") || "usd";
}

export function jellyfinUrl(): string {
  return (
    getSetting("jellyfin_url") || "https://media.innotel.us"
  );
}

export function jellyfinApiKey(): string | undefined {
  return getSetting("jellyfin_api_key");
}

export function adminPassword(): string | undefined {
  return getSetting("admin_password");
}

/**
 * Returns only DB-stored settings (no env fallback).
 * Used for export/backup so the file contains only overrides.
 */
export function getExportableSettings(): Record<string, string> {
  const keys = [
    "stripe_secret_key",
    "stripe_webhook_secret",
    "stripe_currency",
    "jellyfin_url",
    "jellyfin_api_key",
    "admin_password",
  ];

  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (row !== undefined) {
      result[key] = row.value;
    }
  }
  return result;
}
export function settingsStatus() {
  return {
    stripeConfigured: Boolean(stripeSecretKey()),
    stripeWebhookConfigured: Boolean(stripeWebhookSecret()),
    jellyfinConfigured: Boolean(jellyfinApiKey()),
    jellyfinUrl: jellyfinUrl(),
    stripeCurrency: stripeCurrency(),
    adminPasswordSet: Boolean(adminPassword()),
  };
}

/**
 * Returns all editable settings for the admin UI.
 * Sensitive values are masked (only first/last few chars shown).
 */
export function getSettingsForAdmin(): Record<
  string,
  { value: string; masked: string; source: "db" | "env" }
> {
  const keys = [
    "stripe_secret_key",
    "stripe_webhook_secret",
    "stripe_currency",
    "jellyfin_url",
    "jellyfin_api_key",
    "admin_password",
  ];

  const result: Record<
    string,
    { value: string; masked: string; source: "db" | "env" }
  > = {};

  for (const key of keys) {
    const value = getSetting(key) ?? "";
    const dbRow = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    const source: "db" | "env" = dbRow ? "db" : "env";

    let masked = value;
    if (value && (key.includes("secret") || key.includes("password") || key.includes("api_key"))) {
      if (value.length <= 8) {
        masked = "••••••••";
      } else {
        masked = value.slice(0, 4) + "••••••••" + value.slice(-4);
      }
    }

    result[key] = { value, masked, source };
  }

  return result;
}
