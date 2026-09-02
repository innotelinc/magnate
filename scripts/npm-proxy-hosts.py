#!/usr/bin/env python3
"""
npm-proxy-hosts.py — provision Nginx Proxy Manager proxy hosts + wildcard SSL.

Creates the Magnate subdomains on an Nginx Proxy Manager instance via its API:

    app.<DOMAIN>      -> http://127.0.0.1:3000  (this app / storefront)
    api.<DOMAIN>      -> http://127.0.0.1:8000  (ARR stack billing-api)
    auth.<DOMAIN>     -> http://127.0.0.1:9000  (Authentik)
    media.<DOMAIN>    -> http://127.0.0.1:8096  (Jellyfin)
    billing.<DOMAIN>  -> http://127.0.0.1:3000  (this app — Stripe portal UI)
    admin.<DOMAIN>    -> http://127.0.0.1:3000  (this app — /admin panel)

A wildcard Let's Encrypt certificate ( *.DOMAIN + DOMAIN ) is issued via the
DNS challenge so every subdomain gets SSL automatically. Requires NPM >= 2.11
(dns challenge support) and DNS credentials for your provider.

Configuration (env vars, see .env.sample):
    NPM_API_URL           e.g. https://npm.example.com/api
    NPM_API_IDENTITY      NPM login
    NPM_API_SECRET        NPM password
    DOMAIN                base domain, e.g. magnate.innotel.us
    NPM_DNS_PROVIDER      certbot-style provider id, e.g. cloudflare
    NPM_DNS_EMAIL         account e-mail for the DNS provider
    NPM_DNS_CREDENTIALS   JSON object of provider credentials
    NPM_HOSTS_JSON        (optional) JSON override for the host map:
                          [{"subdomain":"app","forward_host":"127.0.0.1","forward_port":3000}, ...]

Only stdlib — run with:  python3 scripts/npm-proxy-hosts.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

# ---------------------------------------------------------------- config

def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()

NPM_API_URL = env("NPM_API_URL").rstrip("/")
NPM_IDENTITY = env("NPM_API_IDENTITY")
NPM_SECRET = env("NPM_API_SECRET")
DOMAIN = env("DOMAIN")
DNS_PROVIDER = env("NPM_DNS_PROVIDER", "cloudflare")
DNS_EMAIL = env("NPM_DNS_EMAIL")
DNS_CREDENTIALS_RAW = env("NPM_DNS_CREDENTIALS", "{}")
HOSTS_JSON = env("NPM_HOSTS_JSON", "")

DEFAULT_HOSTS = [
    {"subdomain": "app", "forward_host": "127.0.0.1", "forward_port": 3000},
    {"subdomain": "api", "forward_host": "127.0.0.1", "forward_port": 8000},
    {"subdomain": "auth", "forward_host": "127.0.0.1", "forward_port": 9000},
    {"subdomain": "media", "forward_host": "127.0.0.1", "forward_port": 8096},
    {"subdomain": "billing", "forward_host": "127.0.0.1", "forward_port": 3000},
    {"subdomain": "admin", "forward_host": "127.0.0.1", "forward_port": 3000},
]

def load_hosts() -> list:
    if HOSTS_JSON:
        try:
            parsed = json.loads(HOSTS_JSON)
            if isinstance(parsed, list) and parsed:
                return parsed
            print("warning: NPM_HOSTS_JSON is not a non-empty list — using defaults",
                  file=sys.stderr)
        except json.JSONDecodeError as exc:
            print(f"warning: NPM_HOSTS_JSON is invalid JSON ({exc}) — using defaults",
                  file=sys.stderr)
    return DEFAULT_HOSTS

# ---------------------------------------------------------------- http

class ApiClient:
    def __init__(self, base: str):
        self.base = base
        self.token = None

    def _headers(self, json_body: bool = True) -> dict:
        headers = {"Accept": "application/json"}
        if json_body:
            headers["Content-Type"] = "application/json"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(self, method: str, path: str, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            f"{self.base}{path}", data=body, headers=self._headers(), method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:300]
            raise SystemExit(
                f"error: {method} {path} failed ({exc.code}): {detail}"
            )
        except urllib.error.URLError as exc:
            raise SystemExit(
                f"error: cannot reach NPM API at {self.base} — is Nginx Proxy "
                f"Manager running and NPM_API_URL correct? ({exc.reason})"
            )

    def login(self, identity: str, secret: str):
        data = self._request("POST", "/tokens", {"identity": identity, "secret": secret})
        self.token = data.get("token")
        if not self.token:
            raise SystemExit("error: NPM login failed — check NPM_API_IDENTITY/NPM_API_SECRET")


# ---------------------------------------------------------------- logic

def find_host(client: ApiClient, domain_name: str):
    hosts = client._request("GET", "/nginx/proxy-hosts")
    return next((h for h in hosts if domain_name in (h.get("domain_names") or [])), None)


def find_certificate(client: ApiClient, domains: list):
    certs = client._request("GET", "/nginx/certificates")
    for c in certs:
        cdomains = c.get("domains") or []
        if set(domains).issubset({str(d).lower() for d in cdomains}):
            return c
    return None


def wait_for_certificate(client: ApiClient, cert_id, timeout_sec: int = 300):
    """Poll NPM until the certificate is issued (DNS challenges are slow)."""
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        cert = client._request("GET", f"/nginx/certificates/{cert_id}")
        status = (cert.get("status") or "processing").lower()
        if status == "issued":
            return cert
        if status == "error":
            raise SystemExit(
                f"error: Let's Encrypt failed for certificate #{cert_id}. "
                f"Check NPM_DNS_PROVIDER / NPM_DNS_EMAIL / NPM_DNS_CREDENTIALS "
                f"and that DNS for the wildcard record exists."
            )
        print(f"  cert #{cert_id}: {status}… (waiting for issuance)")
        time.sleep(15)
    raise SystemExit(
        f"error: timed out waiting for certificate #{cert_id}. Check DNS "
        f"challenge propagation (wildcard records must be real)."
    )


def ensure_wildcard_cert(client: ApiClient, domain: str):
    domains = [f"*.{domain}", domain]
    existing = find_certificate(client, domains)
    if existing:
        print(f"· certificate already exists: #{existing['id']} ({existing.get('provider')})")
        return existing["id"]

    try:
        provider_options = json.loads(DNS_CREDENTIALS_RAW)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: NPM_DNS_CREDENTIALS is invalid JSON ({exc})")
    if not isinstance(provider_options, dict):
        raise SystemExit("error: NPM_DNS_CREDENTIALS must be a JSON object")
    provider_options.setdefault("dns_provider", DNS_PROVIDER)
    if DNS_EMAIL:
        provider_options.setdefault("dns_provider_email", DNS_EMAIL)

    print(f"· requesting Let's Encrypt wildcard cert for {domain} "
          f"(DNS challenge via {DNS_PROVIDER})…")
    cert = client._request(
        "POST",
        "/nginx/certificates",
        {
            "provider": "letsencrypt",
            "domains": domains,
            "meta": {"letsencrypt_agree": True, "dns_challenge": True},
            "provider_options": provider_options,
        },
    )
    cert_id = cert.get("id")
    if not cert_id:
        raise SystemExit("error: NPM did not return a certificate id")
    wait_for_certificate(client, cert_id)
    return cert_id


def upsert_proxy_host(client: ApiClient, host_cfg: dict, domain: str, cert_id):
    subdomain = host_cfg["subdomain"].lower()
    domain_name = f"{subdomain}.{domain}"
    forward = {
        "forward_scheme": host_cfg.get("forward_scheme", "http"),
        "forward_host": host_cfg["forward_host"],
        "forward_port": int(host_cfg["forward_port"]),
    }
    payload = {
        "domain_names": [domain_name],
        **forward,
        "certificate_id": cert_id if cert_id else None,
        "block_exploits": True,
        "caching_enabled": False,
        "allow_websocket_upgrade": True,
        "http2_support": True,
        "hsts_enabled": True,
        "access_list_id": "0",
        "advanced_config": "",
        "meta": {"letsencrypt_agree": True, "dns_challenge": True, "hsts_enabled": True, "nginx_online": True},
    }

    existing = find_host(client, domain_name)
    if existing:
        # Idempotent update — skip when nothing changed.
        same = (
            existing.get("forward_scheme") == forward["forward_scheme"]
            and existing.get("forward_host") == forward["forward_host"]
            and existing.get("forward_port") == forward["forward_port"]
            and existing.get("certificate_id") == cert_id
        )
        if same:
            print(f"· {domain_name} already provisioned (proxy host #{existing['id']})")
            return existing["id"]
        client._request("PUT", f"/nginx/proxy-hosts/{existing['id']}", payload)
        print(f"· updated {domain_name} → {forward['forward_scheme']}://"
              f"{forward['forward_host']}:{forward['forward_port']} "
              f"(proxy host #{existing['id']})")
        return existing["id"]

    created = client._request("POST", "/nginx/proxy-hosts", payload)
    print(f"· created {domain_name} → {forward['forward_scheme']}://"
          f"{forward['forward_host']}:{forward['forward_port']} "
          f"(proxy host #{created.get('id')})")
    return created.get("id")


# ---------------------------------------------------------------- main

def main():
    missing = [name for name, val in [
        ("NPM_API_URL", NPM_API_URL),
        ("NPM_API_IDENTITY", NPM_IDENTITY),
        ("NPM_API_SECRET", NPM_SECRET),
        ("DOMAIN", DOMAIN),
    ] if not val]
    if missing:
        raise SystemExit(
            f"error: missing required env var(s): {', '.join(missing)}. "
            f"Copy .env.sample to .env and fill them in."
        )

    hosts = load_hosts()
    print(f"npm-proxy-hosts.py — provisioning {len(hosts)} hosts on *.{DOMAIN}")
    print(f"  NPM API:   {NPM_API_URL}")
    print(f"  DNS:       {DNS_PROVIDER} ({DNS_EMAIL or 'no account e-mail set'})")

    client = ApiClient(NPM_API_URL)
    client.login(NPM_IDENTITY, NPM_SECRET)
    print("· authenticated with Nginx Proxy Manager\n")

    cert_id = ensure_wildcard_cert(client, DOMAIN)
    print()

    for host_cfg in hosts:
        upsert_proxy_host(client, host_cfg, DOMAIN, cert_id)

    print("\nAll proxy hosts provisioned. DNS must point every subdomain at the")
    print("Nginx Proxy Manager host (A records to its public IP):")
    for host_cfg in hosts:
        print(f"  {host_cfg['subdomain']}.{DOMAIN}  A  <NPM HOST IP>")
    print(f"  *.{DOMAIN}  A  <NPM HOST IP>   (or individual records)")
    print("Certificates auto-renew via NPM.")


if __name__ == "__main__":
    main()