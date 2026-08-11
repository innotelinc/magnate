"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  DownloadIcon,
  EyeIcon,
  LogoutIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
  CreditCardIcon,
} from "./icons";

/* ---------- types ---------- */

interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  features: string[];
  highlighted: boolean;
  active: boolean;
}

interface AppUser {
  id: number;
  email: string;
  username: string;
  jellyfin_user_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: number | null;
  plan_name: string | null;
  status: string;
  current_period_end: number | null;
  credentials_claimed_at: string | null;
  provisioning_error: string | null;
  created_at: string;
}

interface StatusInfo {
  stripeConfigured: boolean;
  stripeWebhookConfigured: boolean;
  jellyfinConfigured: boolean;
  jellyfinUrl: string;
  stripeCurrency: string;
  adminPasswordSet: boolean;
}

interface AdminSetting {
  value: string;
  masked: string;
  source: "db" | "env";
}

type AdminSettings = Record<string, AdminSetting>;

/* ---------- helpers ---------- */

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  pending:
    "bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
  past_due:
    "bg-orange-500/10 text-orange-600 ring-orange-500/30 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/30",
  unpaid:
    "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30",
  cancelled:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:bg-zinc-400/10 dark:text-zinc-400 dark:ring-zinc-400/30",
  disabled:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:bg-zinc-400/10 dark:text-zinc-400 dark:ring-zinc-400/30",
  error:
    "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${
        STATUS_STYLES[status] ?? STATUS_STYLES.pending
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-950/10 bg-black/[0.03] px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-zinc-600";

/* ---------- plan editor ---------- */

function PlanEditor({
  initial,
  onDone,
  onSaved,
}: {
  initial?: Plan;
  onDone: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [monthly, setMonthly] = useState(
    initial ? String(initial.priceMonthlyCents / 100) : "",
  );
  const [yearly, setYearly] = useState(
    initial ? String(initial.priceYearlyCents / 100) : "",
  );
  const [features, setFeatures] = useState(initial?.features.join("\n") ?? "");
  const [highlighted, setHighlighted] = useState(initial?.highlighted ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    const payload = {
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: description || null,
      priceMonthlyCents: Math.round(parseFloat(monthly || "0") * 100),
      priceYearlyCents: Math.round(parseFloat(yearly || "0") * 100),
      features: features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
      highlighted,
      active,
      sortOrder: 0,
    };
    setSaving(true);
    try {
      if (initial) {
        const res = await api<{ stripeWarning?: string }>(
          `/api/admin/plans/${initial.id}`,
          { method: "PUT", body: JSON.stringify(payload) },
        );
        onSaved(
          `Plan updated.${res.stripeWarning ? ` ${res.stripeWarning}` : ""}`,
        );
      } else {
        const res = await api<{ stripeWarning?: string }>("/api/admin/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onSaved(
          `Plan created.${res.stripeWarning ? ` ${res.stripeWarning}` : ""}`,
        );
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-400/30 bg-brand-500/[0.06] p-5">
      <p className="mb-4 text-sm font-semibold text-brand-600 dark:text-brand-200">
        {initial ? `Edit ${initial.name}` : "New plan"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Slug</label>
          <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="standard" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Perfect for streaming on a couple of devices." />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Monthly price ($)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="5.00" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Yearly price ($)</label>
          <input className={inputCls} type="number" min="0" step="0.01" value={yearly} onChange={(e) => setYearly(e.target.value)} placeholder="50.00" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
            Features (one per line)
          </label>
          <textarea
            className={`${inputCls} min-h-24 resize-y font-mono text-xs`}
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder={"4K streaming\n2 devices at once"}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-300">
          <input type="checkbox" checked={highlighted} onChange={(e) => setHighlighted(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
          Highlight (most popular)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-300">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          Active (visible on site)
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={saving || !name}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create plan"}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border border-zinc-950/15 px-4 py-2 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- user editor ---------- */

function UserEditor({
  plans,
  onDone,
  onSaved,
}: {
  plans: Plan[];
  onDone: () => void;
  onSaved: (msg: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [planId, setPlanId] = useState("");
  const [provision, setProvision] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await api<{
        ok?: boolean;
        user?: AppUser;
        provisioningError?: string;
      }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          username,
          password,
          planId: planId ? Number(planId) : null,
          provisionJellyfin: provision,
        }),
      });
      let msg = `User "${username}" created.`;
      if (res.provisioningError) {
        msg += ` ⚠ Jellyfin: ${res.provisioningError}`;
      }
      onSaved(msg);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-400/30 bg-brand-500/[0.06] p-5">
      <p className="mb-4 text-sm font-semibold text-brand-600 dark:text-brand-200">Add user</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Email</label>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Username</label>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="johndoe"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Password</label>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 4 characters"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Plan (optional)</label>
          <select
            className={inputCls}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">No plan</option>
            {plans
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 sm:col-span-2 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={provision}
            onChange={(e) => setProvision(e.target.checked)}
            className="h-4 w-4 accent-indigo-500"
          />
          Create account in Jellyfin
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={saving || !email || !username || !password}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create user"}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border border-zinc-950/15 px-4 py-2 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- user edit editor ---------- */

function UserEditEditor({
  user,
  plans,
  onDone,
  onSaved,
}: {
  user: AppUser;
  plans: Plan[];
  onDone: () => void;
  onSaved: (msg: string) => void;
}) {
  const [email, setEmail] = useState(user.email);
  const [username, setUsername] = useState(user.username);
  const [planId, setPlanId] = useState(user.plan_id ? String(user.plan_id) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changed =
    email !== user.email || username !== user.username || planId !== (user.plan_id ? String(user.plan_id) : "");

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { action: "edit" };
      if (email !== user.email) payload.email = email;
      if (username !== user.username) payload.username = username;
      if (planId !== (user.plan_id ? String(user.plan_id) : "")) {
        payload.planId = planId ? Number(planId) : null;
      }

      if (Object.keys(payload).length === 1) {
        onDone();
        return;
      }

      await api(`/api/admin/users/${user.id}/action`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSaved(`User "${username}" updated.`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-400/30 bg-brand-500/[0.06] p-5">
      <p className="mb-4 text-sm font-semibold text-brand-600 dark:text-brand-200">
        Edit {user.username}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Email</label>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Username</label>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="johndoe"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Plan</label>
          <select
            className={inputCls}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">No plan</option>
            {plans
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={saving || !changed}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg border border-zinc-950/15 px-4 py-2 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- settings editor ---------- */

const SETTING_FIELDS: {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}[] = [
  {
    key: "stripe_secret_key",
    label: "Stripe Secret Key",
    placeholder: "sk_live_xxx or sk_test_xxx",
  },
  {
    key: "stripe_webhook_secret",
    label: "Stripe Webhook Secret",
    placeholder: "whsec_xxx",
  },
  {
    key: "stripe_currency",
    label: "Stripe Currency",
    placeholder: "usd",
  },
  {
    key: "jellyfin_url",
    label: "Jellyfin URL",
    placeholder: "https://media.example.com",
  },
  {
    key: "jellyfin_api_key",
    label: "Jellyfin API Key",
    placeholder: "your-api-key",
  },
  {
    key: "admin_password",
    label: "Admin Password",
    placeholder: "strong-password",
  },
];

function SettingsEditor({
  settings,
  onSaved,
  onCancel,
}: {
  settings: AdminSettings;
  onSaved: (msg: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of SETTING_FIELDS) {
      const s = settings[field.key];
      // For env-sourced secrets, don't pre-fill the actual value.
      const isSecret =
        field.key.includes("secret") ||
        field.key.includes("password") ||
        field.key.includes("api_key");
      init[field.key] = isSecret && s?.source === "env" ? "" : (s?.value ?? "");
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    // Only send fields that changed or are non-empty.
    const payload: Record<string, string> = {};
    for (const field of SETTING_FIELDS) {
      const currentDb = settings[field.key]?.value ?? "";
      if (values[field.key] !== currentDb) {
        payload[field.key] = values[field.key];
      }
    }

    if (Object.keys(payload).length === 0) {
      onCancel();
      return;
    }

    setSaving(true);
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      onSaved("Settings saved. Restart not required — changes take effect immediately.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-brand-400/30 bg-brand-500/[0.06] p-5">
      <p className="mb-4 text-sm font-semibold text-brand-600 dark:text-brand-200">Edit settings</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {SETTING_FIELDS.map((field) => {
          const current = settings[field.key];
          return (
            <div
              key={field.key}
              className={field.key === "stripe_secret_key" || field.key === "jellyfin_url" ? "sm:col-span-2" : ""}
            >
              <label className="mb-1 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                {field.label}
                {current && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      current.source === "db"
                        ? "bg-fuchsia-400/10 text-fuchsia-600 dark:text-fuchsia-300"
                        : "bg-zinc-400/10 text-zinc-600 dark:text-zinc-500"
                    }`}
                  >
                    {current.source === "db" ? "custom" : "env"}
                  </span>
                )}
              </label>
              {current && current.masked !== current.value && current.source === "env" && !values[field.key] && (
                <p className="mb-1 font-mono text-xs text-zinc-600 dark:text-zinc-500">{current.masked}</p>
              )}
              <input
                className={inputCls}
                type={
                  (field.key.includes("secret") || field.key.includes("password") || field.key.includes("api_key"))
                    ? "password"
                    : "text"
                }
                value={values[field.key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                placeholder={field.placeholder}
              />
              {current && current.source === "db" && (
                <p className="mt-1 text-[10px] text-fuchsia-600/80 dark:text-fuchsia-400/70">
                  Overrides env var. Clear to restore env fallback.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-zinc-950/15 px-4 py-2 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------- dashboard ---------- */

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"plans" | "users" | "settings">("plans");
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: number; username: string; password: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [statusData, plansData, usersData, settingsData] = await Promise.all([
        api<StatusInfo>("/api/admin/status"),
        api<{ plans: Plan[] }>("/api/admin/plans"),
        api<{ users: AppUser[] }>("/api/admin/users"),
        api<AdminSettings>("/api/admin/settings"),
      ]);
      setStatus(statusData);
      setPlans(plansData.plans);
      setUsers(usersData.users);
      setSettings(settingsData);
    } catch {
      router.push("/admin/login");
      return;
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Defer the first load so we don't synchronously set state in the effect.
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
  }

  async function userAction(user: AppUser, action: string, extra?: Record<string, boolean>) {
    setBusy(user.id);
    setNotice(null);
    try {
      if (action === "delete") {
        const stripeMsg =
          extra?.cancelStripe && user.stripe_subscription_id
            ? " and cancel their Stripe subscription"
            : "";
        const ok = window.confirm(
          `Delete ${user.username} from Jellyfin${stripeMsg}? This cannot be undone.`,
        );
        if (!ok) return;
      }
      const res = await api<{ username?: string; password?: string }>(
        `/api/admin/users/${user.id}/action`,
        { method: "POST", body: JSON.stringify({ action, ...extra }) },
      );
      if (action === "reveal" && res.password) {
        setRevealed({ id: user.id, username: res.username!, password: res.password });
      }
      await refresh();
      setNotice(`${action} completed.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`Delete plan "${plan.name}"?`)) return;
    try {
      await api(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      setNotice("Plan deleted.");
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function handleExport() {
    try {
      const res = await fetch("/api/admin/settings/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jellyfin-sub-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Settings exported successfully.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed.");
    }
  }

  async function handleImport(file: File) {
    setImporting(true);
    setNotice(null);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON file. Please upload a valid settings backup.");
      }
      const res = await fetch("/api/admin/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Import failed");
      setNotice(`Settings imported successfully (${(data as { imported: number }).imported} keys).`);
      refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-600 dark:text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-950/15 border-t-brand-400 dark:border-white/10" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin panel</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            Manage subscription plans, users, and settings.
          </p>
        </div>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 rounded-xl border border-zinc-950/15 px-4 py-2 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
        >
          <LogoutIcon className="h-4 w-4" />
          Log out
        </button>
      </div>

      {/* config banner */}
      {status && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Stripe billing",
              ok: status.stripeConfigured,
              detail: status.stripeConfigured
                ? `Configured (${status.stripeCurrency.toUpperCase()})`
                : "Missing secret key",
            },
            {
              label: "Stripe webhook",
              ok: status.stripeWebhookConfigured,
              detail: status.stripeWebhookConfigured
                ? "Webhook secret set"
                : "Missing webhook secret",
            },
            {
              label: "Jellyfin",
              ok: status.jellyfinConfigured,
              detail: status.jellyfinConfigured
                ? status.jellyfinUrl
                : "Missing API key",
            },
            {
              label: "Admin password",
              ok: status.adminPasswordSet,
              detail: status.adminPasswordSet
                ? "Set"
                : "Missing password",
            },
          ].map((item) => (
            <div key={item.label} className="glass flex items-center gap-3 rounded-xl px-4 py-3">
              <span
                className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${
                  item.ok ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 animate-pulse-glow dark:bg-rose-400"
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{item.label}</p>
                <p className="truncate text-xs text-zinc-600 dark:text-zinc-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded-xl border border-zinc-950/10 bg-black/[0.04] px-4 py-3 text-sm text-zinc-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
          {notice}
        </div>
      )}

      {/* tabs */}
      <div className="mt-8 flex gap-2 border-b border-zinc-950/10 dark:border-white/[0.08]">
        {(["plans", "users", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-xl px-5 py-2.5 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-brand-400 text-zinc-950 dark:text-white"
                : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {t === "plans" ? "Plans" : t === "users" ? `Users (${users.length})` : (
              <span className="flex items-center gap-1.5">
                <SettingsIcon className="h-4 w-4" />
                Settings
              </span>
            )}
          </button>
        ))}
      </div>

      {/* plans tab */}
      {tab === "plans" && (
        <div className="mt-6 space-y-4">
          {editing === "new" && (
            <PlanEditor
              onDone={() => setEditing(null)}
              onSaved={(msg) => {
                setNotice(msg);
                refresh();
              }}
            />
          )}
          {plans.map((plan) => (
            <div key={plan.id} className="glass rounded-2xl p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {plan.highlighted && (
                    <span className="rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                  <div>
                    <p className="font-semibold">
                      {plan.name}
                      <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-500">
                        {plan.active ? "active" : "inactive"}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-500">
                      {money(plan.priceMonthlyCents, status?.stripeCurrency ?? "usd")}/mo ·{" "}
                      {money(plan.priceYearlyCents, status?.stripeCurrency ?? "usd")}/yr
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setEditing(
                        editing !== null && editing !== "new" && editing.id === plan.id
                          ? null
                          : plan,
                      )
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-950/15 px-3 py-1.5 text-xs font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => deletePlan(plan)}
                    className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-300"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {plan.features.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {plan.features.map((f) => (
                    <span
                      key={f}
                      className="flex items-center gap-1 rounded-full border border-zinc-950/10 bg-black/[0.03] px-2.5 py-0.5 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400"
                    >
                      <CheckIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      {f}
                    </span>
                  ))}
                </div>
              )}

              {editing !== null && editing !== "new" && editing.id === plan.id && (
                <div className="mt-4">
                  <PlanEditor
                    initial={plan}
                    onDone={() => setEditing(null)}
                    onSaved={(msg) => {
                      setNotice(msg);
                      refresh();
                    }}
                  />
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setEditing("new")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-950/20 py-4 text-sm font-medium text-zinc-600 transition-colors hover:border-brand-400/50 hover:text-zinc-950 dark:border-white/20 dark:text-zinc-400 dark:hover:text-white"
          >
            <PlusIcon className="h-4 w-4" />
            Create a new plan
          </button>
        </div>
      )}

      {/* users tab */}
      {tab === "users" && (
        <div className="mt-6 space-y-4">
          {addingUser && (
            <UserEditor
              plans={plans}
              onDone={() => setAddingUser(false)}
              onSaved={(msg) => {
                setNotice(msg);
                refresh();
              }}
            />
          )}

          {!addingUser && (
            <button
              onClick={() => setAddingUser(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-950/20 py-4 text-sm font-medium text-zinc-600 transition-colors hover:border-brand-400/50 hover:text-zinc-950 dark:border-white/20 dark:text-zinc-400 dark:hover:text-white"
            >
              <PlusIcon className="h-4 w-4" />
              Add user
            </button>
          )}

          {editingUserId && (() => {
            const editUser = users.find((u) => u.id === editingUserId);
            if (!editUser) return null;
            return (
              <UserEditEditor
                user={editUser}
                plans={plans}
                onDone={() => setEditingUserId(null)}
                onSaved={(msg) => {
                  setNotice(msg);
                  refresh();
                }}
              />
            );
          })()}

          {users.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-950/10 dark:border-white/[0.08]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-950/10 bg-black/[0.02] text-xs uppercase tracking-wide text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-zinc-500">
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Period end</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-zinc-950/[0.06] transition-colors hover:bg-black/[0.02] dark:border-white/[0.05] dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{user.username}</p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-500">{user.email}</p>
                          {user.provisioning_error && (
                            <p className="mt-1 max-w-60 truncate text-xs text-rose-600 dark:text-rose-400" title={user.provisioning_error}>
                              ⚠ {user.provisioning_error}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-800 dark:text-zinc-300">
                          {user.plan_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={user.provisioning_error ? "error" : user.status} />
                        </td>
                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                          {user.current_period_end
                            ? new Date(user.current_period_end * 1000).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              title="Edit user"
                              onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                              disabled={busy === user.id}
                              className="rounded-lg border border-zinc-950/15 px-2 py-1 text-xs transition-colors hover:border-zinc-950/30 disabled:opacity-50 dark:border-white/10 dark:hover:border-white/30"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Reveal credentials"
                              onClick={() => userAction(user, "reveal")}
                              disabled={busy === user.id}
                              className="rounded-lg border border-zinc-950/15 px-2 py-1 text-xs transition-colors hover:border-zinc-950/30 disabled:opacity-50 dark:border-white/10 dark:hover:border-white/30"
                            >
                              <EyeIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Re-provision in Jellyfin"
                              onClick={() => userAction(user, "reprovision")}
                              disabled={busy === user.id}
                              className="rounded-lg border border-zinc-950/15 px-2 py-1 text-xs transition-colors hover:border-zinc-950/30 disabled:opacity-50 dark:border-white/10 dark:hover:border-white/30"
                            >
                              <RefreshIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Disable access"
                              onClick={() => userAction(user, "disable")}
                              disabled={busy === user.id}
                              className="rounded-lg border border-zinc-950/15 px-2 py-1 text-xs text-amber-600 transition-colors hover:border-amber-500/40 disabled:opacity-50 dark:border-white/10 dark:text-amber-300 dark:hover:border-amber-400/40"
                            >
                              Off
                            </button>
                            <button
                              title="Enable access"
                              onClick={() => userAction(user, "enable")}
                              disabled={busy === user.id}
                              className="rounded-lg border border-zinc-950/15 px-2 py-1 text-xs text-emerald-600 transition-colors hover:border-emerald-500/40 disabled:opacity-50 dark:border-white/10 dark:text-emerald-300 dark:hover:border-emerald-400/40"
                            >
                              On
                            </button>
                            <button
                              title="Delete from Jellyfin + cancel subscription"
                              onClick={() => userAction(user, "delete", { cancelStripeSubscription: true })}
                              disabled={busy === user.id}
                              className="rounded-lg border border-rose-500/30 px-2 py-1 text-xs text-rose-600 transition-colors hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {users.length === 0 && !addingUser && (
            <div className="flex flex-col items-center gap-3 py-16 text-zinc-600 dark:text-zinc-500">
              <UserIcon className="h-8 w-8" />
              <p className="text-sm">No users yet. Add one above or share the signup link!</p>
            </div>
          )}
        </div>
      )}

      {/* settings tab */}
      {tab === "settings" && settings && (
        <div className="mt-6 space-y-4">
          {editingSettings ? (
            <SettingsEditor
              settings={settings}
              onSaved={(msg) => {
                setNotice(msg);
                setEditingSettings(false);
                refresh();
              }}
              onCancel={() => setEditingSettings(false)}
            />
          ) : (
            <>
              {/* summary cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                {SETTING_FIELDS.map((field) => {
                  const s = settings[field.key];
                  const isSecret =
                    field.key.includes("secret") ||
                    field.key.includes("password") ||
                    field.key.includes("api_key");
                  return (
                    <div key={field.key} className="glass rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{field.label}</p>
                            {s && (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  s.source === "db"
                                    ? "bg-fuchsia-400/10 text-fuchsia-600 dark:text-fuchsia-300"
                                    : "bg-zinc-400/10 text-zinc-600 dark:text-zinc-500"
                                }`}
                              >
                                {s.source === "db" ? "custom" : "env"}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate font-mono text-xs text-zinc-600 dark:text-zinc-500">
                            {s ? (isSecret ? s.masked : s.value || "(empty)") : "(not set)"}
                          </p>
                        </div>
                        <span
                          className={`ml-3 flex h-2 w-2 shrink-0 rounded-full ${
                            s && s.value ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* export / import row */}
              <div className="flex gap-3">
                <button
                  onClick={handleExport}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-950/20 py-4 text-sm font-medium text-zinc-600 transition-colors hover:border-emerald-500/50 hover:text-zinc-950 dark:border-white/20 dark:text-zinc-400 dark:hover:text-white"
                >
                  <DownloadIcon className="h-4 w-4" />
                  Export backup
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-950/20 py-4 text-sm font-medium text-zinc-600 transition-colors hover:border-amber-500/50 hover:text-zinc-950 disabled:opacity-50 dark:border-white/20 dark:text-zinc-400 dark:hover:text-white"
                >
                  <UploadIcon className="h-4 w-4" />
                  {importing ? "Importing…" : "Import backup"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImport(file);
                    // Reset so the same file can be re-selected.
                    e.target.value = "";
                  }}
                />
              </div>

              <button
                onClick={() => setEditingSettings(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-950/20 py-4 text-sm font-medium text-zinc-600 transition-colors hover:border-brand-400/50 hover:text-zinc-950 dark:border-white/20 dark:text-zinc-400 dark:hover:text-white"
              >
                <PencilIcon className="h-4 w-4" />
                Edit settings
              </button>
            </>
          )}
        </div>
      )}

      {/* reveal modal */}
      {revealed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setRevealed(null)}
        >
          <div
            className="animate-pop-in w-full max-w-sm rounded-3xl border border-zinc-950/10 bg-white p-7 dark:border-white/10 dark:bg-[#0b0d15]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <CreditCardIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
              {revealed.username}&apos;s credentials
            </h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-500">
              Stored encrypted. Share only over a secure channel.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs text-zinc-600 dark:text-zinc-500">Username</p>
                <p className="font-mono text-sm font-semibold">{revealed.username}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-600 dark:text-zinc-500">Password</p>
                <p className="break-all font-mono text-sm font-semibold text-fuchsia-600 dark:text-fuchsia-300">
                  {revealed.password}
                </p>
              </div>
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="mt-6 w-full rounded-xl border border-zinc-950/15 py-2.5 text-sm transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
