#!/usr/bin/env python3
"""verify-sso.py — prove Magnate's admin sign-in is Cerulean Authentik-only.

Drives the real authorization-code + PKCE flow against a live deployment:

    admin.magnate.innotel.us/api/auth/authentik/login
      -> auth.cerulean.innotel.us   (Authentik runs its own auth flow)
      -> admin.magnate.innotel.us/api/auth/authentik/callback
      -> /admin                     (200, admin_session cookie)

and asserts the password path is closed: `POST /api/admin/login` must answer
403 and `GET /admin` without a session must not answer 200.

The dance needs a real Authentik identity, so the script creates a temporary
user on Magnate's admin email allowlist, adds it to the application's group,
and deletes it again on the way out — including when a check fails.

Shipped to the running host, this is the regression test for the "no password
sign-in" posture: it fails loudly if the local login route is ever re-enabled.

Config (environment, falling back to this repo's .env):

    MAGNATE_SSO_APP             default https://admin.magnate.innotel.us
    AUTHENTIK_ISSUER_URL        the app's OIDC issuer; its origin is the IdP
                                host the flow runs on (read from .env)
    AUTHENTIK_API_URL           default the issuer origin
    AUTHENTIK_BOOTSTRAP_TOKEN   Authentik API token (admin). Required.
    MAGNATE_SSO_GROUP           Authentik group the app is bound to
                                (default "Magnate"; set empty to skip)
    MAGNATE_SSO_EMAIL           email to put on the allowlist, default the
                                first AUTHENTIK_ADMIN_EMAILS entry

Exit codes: 0 = pass, 1 = a check failed, 2 = cannot run (unconfigured or the
deployment is unreachable).

Usage:
    python3 scripts/verify-sso.py
"""

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTH_FLOW = "default-authentication-flow"
TEMP_USERNAME = "e2e-magnate-admin"

OK = "\033[32mPASS\033[0m"
BAD = "\033[31mFAIL\033[0m"


class CannotRun(Exception):
    """Configuration or reachability problem — exit 2, not a test failure."""


class CheckFailed(Exception):
    """An assertion about the deployment failed — exit 1."""


# ── config ─────────────────────────────────────────────────────────────────


def read_env_file():
    """Parse the repo's .env into a dict (ignores blanks and comments)."""
    vals = {}
    path = os.path.join(REPO_ROOT, ".env")
    if not os.path.exists(path):
        return vals
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            vals[key.strip()] = val.strip().strip('"').strip("'")
    return vals


class Config:
    def __init__(self):
        env_file = read_env_file()

        def pick(*names, default=""):
            for name in names:
                if os.environ.get(name):
                    return os.environ[name]
                if env_file.get(name):
                    return env_file[name]
            return default

        self.app = pick("MAGNATE_SSO_APP", default="https://admin.magnate.innotel.us").rstrip("/")
        # The flow host is whichever host the issuer lives on: Authentik serves
        # the authorize endpoint, its own login flow and the API there, and the
        # session cookie is per-host — so it must not be guessed. Zones front the
        # same instance under several names (auth.magnate / auth.cerulean), so
        # derive it from AUTHENTIK_ISSUER_URL rather than a fixed default.
        self.issuer = pick("AUTHENTIK_ISSUER_URL")
        parsed = urllib.parse.urlparse(self.issuer)
        self.idp = (
            f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc
            else pick("AUTHENTIK_PUBLIC_URL", default="https://auth.cerulean.innotel.us").rstrip("/")
        )
        self.api = pick("AUTHENTIK_API_URL", default=self.idp).rstrip("/") + "/api/v3"
        self.token = pick("AUTHENTIK_BOOTSTRAP_TOKEN")
        self.group = os.environ.get("MAGNATE_SSO_GROUP", "Magnate")
        self.email = pick("MAGNATE_SSO_EMAIL", "AUTHENTIK_ADMIN_EMAILS")
        if "," in self.email:
            self.email = self.email.split(",")[0].strip()

        if not self.token:
            raise CannotRun(
                "no Authentik API token: set AUTHENTIK_BOOTSTRAP_TOKEN (env or .env)"
            )
        if not self.email:
            raise CannotRun(
                "no allowlisted email: set MAGNATE_SSO_EMAIL or AUTHENTIK_ADMIN_EMAILS"
            )


# ── HTTP ───────────────────────────────────────────────────────────────────


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    """A cookie-jar-backed client that never follows redirects, so the OIDC
    hops can be asserted one at a time."""

    def __init__(self, cfg, base=None):
        self.cfg = cfg
        self.base = base or cfg.idp
        self.jar = http.cookiejar.CookieJar()

    def _open(self, req, timeout=30):
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar), NoRedirect()
        )
        try:
            with opener.open(req, timeout=timeout) as resp:
                return resp.status, resp.headers.get("Location"), resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as err:
            return err.code, err.headers.get("Location"), (err.read() or b"").decode("utf-8", "replace")

    def cookie(self, name):
        for c in self.jar:
            if c.name == name:
                return c.value
        return None

    def get(self, url):
        if url.startswith("/"):  # Authentik-relative
            url = self.base + url
        return self._open(urllib.request.Request(url))

    def post(self, url, payload):
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        # Authentik's flow executor requires the CSRF cookie echoed back.
        req.add_header("X-authentik-CSRF", self.cookie("authentik_csrf") or "")
        req.add_header("Referer", self.base + "/")
        return self._open(req)

    def follow_json(self, url, hops=8):
        """Authentik bounces a POST -> 302 -> GET before handing back the next
        flow stage; follow until the JSON stage arrives."""
        for _ in range(hops):
            status, location, body = self.get(url)
            if status == 200:
                return json.loads(body)
            if status == 302 and location:
                url = location
                continue
            raise CheckFailed(f"expected a JSON stage, got HTTP {status} for {url}")
        raise CheckFailed("too many redirects inside Authentik's auth flow")

    def follow_to_code(self, url, hops=8):
        """Follow redirects until the OAuth2 redirect_uri carries ?code=."""
        for _ in range(hops):
            status, location, body = self.get(url)
            if status == 302 and location:
                if "code=" in location:
                    return location
                url = location
                continue
            raise CheckFailed(
                f"authorize returned {status} instead of a code: {body[:300]}"
            )
        raise CheckFailed("no authorization code after too many redirects")


# ── Authentik admin API ────────────────────────────────────────────────────


class AuthApi:
    def __init__(self, cfg):
        self.cfg = cfg

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.cfg.api + path, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self.cfg.token)
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            raise CannotRun(
                f"{method} {path} -> HTTP {err.code}: "
                f"{(err.read() or b'').decode()[:300]}"
            )

    def find_group(self, name):
        """`superuser_full_list` matters: the plain list is policy-filtered for
        service accounts and can hide real groups."""
        query = "/core/groups/?superuser_full_list=true&name=" + urllib.parse.quote(name)
        for group in self.call("GET", query)["results"]:
            if group.get("name") == name:
                return group["pk"]
        return None


# ── the test ───────────────────────────────────────────────────────────────


def check(condition, message):
    if condition:
        print(f"  {OK}  {message}")
    else:
        raise CheckFailed(message)


def unreachable(err, host):
    """A name that does not resolve, or a connection that never lands.

    Reported, never raised: a resolver that cannot see this name is a finding
    about *this* run, and an unhandled `socket.gaierror` out of urllib would
    bury the checks that already ran behind a traceback.
    """
    if "Name or service not known" in str(err) or "Temporary failure" in str(err):
        return f"cannot resolve {host} from this host ({err})"
    return f"cannot reach {host} ({err})"


def main():
    try:
        cfg = Config()
    except CannotRun as err:
        print(f"SKIP: {err}", file=sys.stderr)
        return 2
    client = Client(cfg)
    api = AuthApi(cfg)
    print("Magnate SSO verification")
    print(f"  app     : {cfg.app}")
    print(f"  idp     : {cfg.idp}")
    print(f"  issuer  : {cfg.issuer or '(unset)'}")
    print(f"  email   : {cfg.email}")
    print(f"  group   : {cfg.group or '(none)'}")
    print()

    created_pk = None
    password = "E2e-Magnate-" + os.urandom(4).hex() + "!Aa1"
    try:
        # ── reachability (a failure here is a skip, not a bad deployment) ──
        try:
            status, _, _ = client.get(cfg.app + "/admin/login")
        except (urllib.error.URLError, OSError) as err:
            raise CannotRun(f"{cfg.app} is unreachable: {err}") from err
        if status >= 500:
            raise CannotRun(f"{cfg.app}/admin/login answered HTTP {status}")

        # ── 1. temporary identity on the allowlist ─────────────────────────
        print("[1] temporary Authentik identity")
        for stale in api.call(
            "GET", "/core/users/?username=" + urllib.parse.quote(TEMP_USERNAME)
        )["results"]:
            api.call("DELETE", f"/core/users/{stale['pk']}/")
        user = api.call(
            "POST",
            "/core/users/",
            {
                "username": TEMP_USERNAME,
                "name": "Magnate SSO Verification",
                "email": cfg.email,
                "is_active": True,
                "path": "users",
                "type": "internal",
            },
        )
        created_pk = user["pk"]
        api.call("POST", f"/core/users/{created_pk}/set_password/", {"password": password})
        group_pk = api.find_group(cfg.group) if cfg.group else None
        if cfg.group and not group_pk:
            raise CannotRun(f"Authentik group {cfg.group!r} not found")
        if group_pk:
            api.call("POST", f"/core/groups/{group_pk}/add_user/", {"pk": created_pk})
        print(f"  {OK}  created {TEMP_USERNAME} (pk={created_pk}) + {cfg.group or 'no group'}")

        # ── 2. Magnate starts the OIDC dance, with PKCE ────────────────────
        print("[2] admin login redirects to Authentik with PKCE")
        status, location, _ = client.get(cfg.app + "/api/auth/authentik/login?next=/admin")
        check(status == 302, f"/api/auth/authentik/login -> HTTP {status} (expected 302)")
        check(
            cfg.idp in (location or ""),
            f"login redirect points at Authentik (got {(location or '-')[:80]})",
        )
        check(client.cookie("oidc_state") is not None, "oidc_state cookie set")
        check(client.cookie("oidc_verifier") is not None, "oidc_verifier cookie set (PKCE)")
        check("code_challenge=" in (location or ""), "authorize URL carries code_challenge")

        # ── 3. run Authentik's own authentication flow ─────────────────────
        print("[3] Authentik authentication flow")
        status, location, _ = client.get(location)
        check(status == 302 and location, f"authorize -> HTTP {status} (expected 302)")
        # Authentik hands back a flow URL on the host it actually serves; pin the
        # client to that origin so the session/CSRF cookies line up.
        flow = urllib.parse.urlparse(urllib.parse.urljoin(client.base, location))
        client.base = f"{flow.scheme}://{flow.netloc}"
        executor = (
            client.base
            + "/api/v3/flows/executor/"
            + AUTH_FLOW
            + "/?"
            + urllib.parse.urlencode({"query": urllib.parse.urlparse(location).query})
        )
        stage = client.follow_json(executor)
        for _ in range(6):
            component = stage.get("component")
            if component == "xak-flow-redirect":
                break
            if component == "ak-stage-identification":
                payload, label = {"uid_field": TEMP_USERNAME}, "username"
            elif component == "ak-stage-password":
                payload, label = {"password": password}, "password"
            else:
                raise CheckFailed(f"unexpected Authentik stage {component}")
            status, next_url, body = client.post(executor, payload)
            if status not in (200, 302):
                raise CheckFailed(f"{label} rejected (HTTP {status}): {body[:200]}")
            # The browser reloads the executor with the flow `query`; that GET
            # is what returns the next stage (or the final redirect).
            stage = client.follow_json(next_url or executor)
        check(
            stage.get("component") == "xak-flow-redirect",
            "flow completed and handed back the authorize URL",
        )

        # ── 4. authorize -> callback -> session ────────────────────────────
        print("[4] authorization code exchange")
        callback = client.follow_to_code(stage["to"])
        code = urllib.parse.parse_qs(urllib.parse.urlparse(callback).query).get("code", [""])[0]
        check(bool(code), f"authorization code issued (len {len(code)})")
        status, location, _ = client.get(callback)
        check(status == 302, f"callback -> HTTP {status} (expected 302)")
        check("/admin" in (location or ""), f"callback lands on /admin (got {location})")
        check(client.cookie("admin_session") is not None, "admin_session cookie issued")

        # ── 5. the session actually opens the admin panel ──────────────────
        print("[5] admin panel")
        status, _, body = client.get(cfg.app + "/admin")
        check(status == 200, f"GET /admin with session -> HTTP {status} (expected 200)")
        check(len(body) > 0, f"GET /admin returned {len(body)} bytes")

        # ── 6. the password path is closed ─────────────────────────────────
        print("[6] password sign-in is disabled")
        anonymous = Client(cfg)
        status, _, _ = anonymous.get(cfg.app + "/admin")
        check(status != 200, f"GET /admin without a session -> HTTP {status} (not 200)")
        for path in ("/api/admin/login", "/api/auth/login"):
            status, _, _ = anonymous.post(cfg.app + path, {"password": "irrelevant"})
            check(status in (403, 404, 405), f"POST {path} -> HTTP {status} (expected 403)")

        print("\nPASS — Magnate admin sign-in is Cerulean Authentik-only")
        return 0
    except CannotRun as err:
        print(f"\nSKIP: {err}", file=sys.stderr)
        return 2
    except CheckFailed as err:
        print(f"\n{BAD} — {err}", file=sys.stderr)
        return 1
    except (urllib.error.URLError, OSError) as err:
        print(f"\n{BAD} — {unreachable(err, cfg.app)}", file=sys.stderr)
        return 1
    finally:
        if created_pk:
            try:
                api.call(
                    "POST",
                    f"/core/users/{created_pk}/set_password/",
                    {"password": os.urandom(24).hex()},
                )
                api.call("DELETE", f"/core/users/{created_pk}/")
                print(f"[cleanup] deleted temporary user pk={created_pk}")
            except CannotRun as err:
                print(f"[cleanup] WARNING: could not delete pk={created_pk}: {err}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
