"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BuildingIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";

/* ---------- types ---------- */

interface Tenant {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  domains: string;
  footer_note: string | null;
  active: boolean;
}

interface TenantForm {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  domains: string;
  footer_note: string;
  active: boolean;
}

const emptyForm: TenantForm = {
  slug: "",
  name: "",
  tagline: "Subscription Platform",
  description: "",
  domains: "",
  footer_note: "",
  active: true,
};

const inputCls =
  "w-full rounded-lg border border-zinc-950/10 bg-black/[0.03] px-3 py-2 text-sm text-zinc-950 placeholder-zinc-400 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/25 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder-zinc-600";

function DomainChips({ domains }: { domains: string }) {
  const list = domains
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (list.length === 0) return <span className="text-zinc-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((d) => (
        <span
          key={d}
          className="rounded-md bg-brand-500/10 px-2 py-0.5 font-mono text-[11px] text-brand-700 ring-1 ring-brand-500/20 dark:text-brand-200 dark:ring-brand-400/20"
        >
          {d}
        </span>
      ))}
    </div>
  );
}

export default function TenantsPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<TenantForm>(emptyForm);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load tenants");
      setTenants(json.tenants ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tenants");
    }
  }, []);

  useEffect(() => {
    // Defer the first load so we don't synchronously set state in the effect.
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function startEdit(t: Tenant) {
    setEditingId(t.id);
    setForm({
      slug: t.slug,
      name: t.name,
      tagline: t.tagline,
      description: t.description ?? "",
      domains: t.domains.split(",").map((d) => d.trim()).filter(Boolean).join(", "),
      footer_note: t.footer_note ?? "",
      active: t.active,
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(emptyForm);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);

    const payload: TenantForm = {
      ...form,
      domains: form.domains
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean)
        .join(", "),
    };

    const url =
      editingId === "new"
        ? "/api/admin/tenants"
        : `/api/admin/tenants/${editingId}`;
    const method = editingId === "new" ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setNotice(
        editingId === "new"
          ? `Tenant "${payload.name}" created.`
          : `Tenant "${payload.name}" updated.`,
      );
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove(t: Tenant) {
    if (!window.confirm(`Delete tenant "${t.name}"? Subscribers must be moved first.`)) {
      return;
    }
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setNotice(`Tenant "${t.name}" deleted.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <BuildingIcon className="h-6 w-6 text-brand-600 dark:text-brand-300" />
            Tenants &amp; white-label
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Each tenant is a branded instance bound to its own domain(s) — own
            name, tagline, description and footer note. Requests are matched by
            Host header and fall back to the Magnate tenant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-950/15 px-3.5 py-2 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
          >
            ← Dashboard
          </Link>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110"
          >
            <PlusIcon className="h-4 w-4" />
            New tenant
          </button>
        </div>
      </div>

      {notice && (
        <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* editor */}
      {editingId !== null && (
        <form
          onSubmit={save}
          className="mt-6 glass rounded-2xl p-6"
        >
          <h2 className="text-sm font-semibold">
            {editingId === "new" ? "Create tenant" : `Edit ${form.name}`}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Slug (new tenants only)
              </label>
              <input
                className={inputCls}
                value={form.slug}
                disabled={editingId !== "new"}
                placeholder="acme"
                onChange={(e) => setForm({ ...form, slug: e.target.value.trim() })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Brand name
              </label>
              <input
                className={inputCls}
                value={form.name}
                required
                placeholder="Acme Cinema"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tagline
              </label>
              <input
                className={inputCls}
                value={form.tagline}
                placeholder="Subscription Platform"
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Domains (comma-separated)
              </label>
              <input
                className={inputCls}
                value={form.domains}
                placeholder="acme.example.com, app.acme.example.com"
                onChange={(e) => setForm({ ...form, domains: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Description (About section)
              </label>
              <textarea
                className={inputCls}
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Footer note
              </label>
              <input
                className={inputCls}
                value={form.footer_note}
                placeholder="Payments processed securely by Stripe."
                onChange={(e) => setForm({ ...form, footer_note: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-950/20 accent-indigo-500"
              />
              Active (accepts traffic on its domains)
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-lg border border-zinc-950/15 px-4 py-2 text-sm font-medium transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110"
              >
                <CheckIcon className="h-4 w-4" />
                Save tenant
              </button>
            </div>
          </div>
        </form>
      )}

      {/* list */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {tenants.map((t) => (
          <div key={t.id} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{t.name}</p>
                  <span className="font-mono text-xs text-zinc-500">{t.slug}</span>
                  {!t.active && (
                    <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 ring-1 ring-zinc-500/20">
                      inactive
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{t.tagline}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => startEdit(t)}
                  className="rounded-lg border border-zinc-950/15 p-2 transition-colors hover:border-zinc-950/30 dark:border-white/15 dark:hover:border-white/30"
                  aria-label={`Edit ${t.name}`}
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(t)}
                  className="rounded-lg border border-rose-500/25 p-2 text-rose-600 transition-colors hover:border-rose-500/50 dark:text-rose-300"
                  aria-label={`Delete ${t.name}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                Domains
              </p>
              <DomainChips domains={t.domains} />
            </div>
            {t.description && (
              <p className="mt-3 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                {t.description}
              </p>
            )}
          </div>
        ))}
        {tenants.length === 0 && (
          <p className="text-sm text-zinc-500">No tenants yet — create one above.</p>
        )}
      </div>
    </div>
  );
}