# Deploying Super BMC (Fly.io, no Lovable)

Hosting is fully self-owned: the frontend and the agent worker run on **Fly.io**,
the database/auth/edge functions on **Supabase**. After the one-time setup below,
**every push to `main` deploys automatically** via GitHub Actions — no dashboards,
no publish buttons.

```
push to main ──► GitHub Actions ──► fly.io  super-bmc-web     (frontend, superbmc.com)
                                └─► fly.io  super-bmc-worker  (agent job worker)
Actions tab  ──► Ops workflow   ──► Supabase edge functions + secret sync + golden set
```

Provider API keys live in exactly one human-facing place: **GitHub repo secrets**.
The Ops workflow propagates them to Fly and Supabase. Keys never appear in code,
chat, or build output. The frontend bundle only ever contains `VITE_*` values,
which are public by design.

---

## One-time setup (owner, ~15 minutes)

### 1. Create the Fly apps (once, from any terminal)

```bash
curl -L https://fly.io/install.sh | sh     # or: brew install flyctl
fly auth signup                            # or: fly auth login
fly apps create super-bmc-web
fly apps create super-bmc-worker
fly tokens create org -x 999999h          # copy the output token (FlyV1 ...)
```

### 2. Fill GitHub repo secrets (one page, one sitting)

GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value / where to get it |
|---|---|
| `FLY_API_TOKEN` | the token from step 1 |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → generate |
| `VITE_SUPABASE_URL` | `https://mehhuxzamnpxnkbrslls.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase dashboard → Settings → API → anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → service_role ⚠️ most sensitive |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `XAI_API_KEY` | console.x.ai |
| `FIRECRAWL_API_KEY` | firecrawl.dev |
| `CREDENTIALS_ENCRYPTION_KEY` | run `openssl rand -base64 32` |
| `EXA_API_KEY` *(optional)* | exa.ai — primary leg of the `grok_live_search` provider chain (semantic search + full page text); falls back to Firecrawl search, then xAI, when unset |
| `FRED_API_KEY` *(optional)* | fred.stlouisfed.org (free) |
| `GOOGLE_TRENDS_API_KEY` *(optional)* | serpapi.com |
| `GH_FEED_TOKEN` *(optional)* | GitHub PAT for the repo-stats feed (name avoids the reserved `GITHUB_TOKEN`) |

### 3. Supabase dashboard (two clicks + two SQL runs)

1. **Vault secret:** Settings → Vault → add secret named `service_role_key`
   with the service-role key as its value (the pg_cron scheduler tick reads it).
2. **SQL Editor:** run the contents of any migrations not yet applied live
   (tracked in `docs/BUILD_STATE.md` OPERATOR QUEUE). The build agent can also
   apply these via the Supabase MCP.

### 4. Run the Ops workflow twice

GitHub → Actions → **Ops** → Run workflow:

1. task = `sync-secrets` (pushes keys to the Fly worker + Supabase functions)
2. task = `deploy-edge-functions`

Then push to `main` (or Actions → **Deploy** → Run workflow) to deploy web + worker.

### 5. Point superbmc.com at Fly (registrar, once)

```bash
fly ips allocate-v4 --shared -a super-bmc-web
fly ips allocate-v6 -a super-bmc-web
fly certs add superbmc.com -a super-bmc-web
fly certs add www.superbmc.com -a super-bmc-web
```

At your DNS provider, replace the Lovable records with:

| Type | Name | Value |
|---|---|---|
| A | `@` | the IPv4 from `fly ips list -a super-bmc-web` |
| AAAA | `@` | the IPv6 from the same list |
| CNAME | `www` | `super-bmc-web.fly.dev` |

`fly certs check superbmc.com -a super-bmc-web` confirms TLS is issued
(minutes after DNS propagates). Then disconnect the domain in Lovable and
archive/delete the Lovable project.

### 6. Acceptance: the live golden set

Actions → **Ops** → task = `live-golden-set`. This runs the 10-claim verifier
golden set against the real model and fails the run below 9/10. Record the
score in `docs/BUILD_STATE.md`.

---

## Day-2 operations

- **Deploy:** push to `main`. That's it. (Or Actions → Deploy → Run workflow.)
- **Rotate/add a key:** update the GitHub secret → run Ops `sync-secrets`.
- **Edge function changes:** run Ops `deploy-edge-functions` after merging.
- **Worker logs:** `fly logs -a super-bmc-worker` (watch it claim jobs).
- **Scale worker:** `fly scale count 1 -a super-bmc-worker` — keep it at 1
  unless job volume demands more (the queue's SKIP LOCKED claiming makes
  multiple workers safe, but 1 is plenty today).
- **Rollback:** `fly releases -a super-bmc-web` → `fly deploy --image <previous>`,
  or revert the commit and push.

## Environment variable map (who reads what)

| Where | Values |
|---|---|
| Frontend bundle (build args, public) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_RUNTIME_MODE=enqueue`, `VITE_AGENT_RUNTIME_ENDPOINT` |
| Fly worker secrets | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `FIRECRAWL_API_KEY`, optional feed keys |
| Supabase edge function secrets | `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `FIRECRAWL_API_KEY`, `CREDENTIALS_ENCRYPTION_KEY` |
| Supabase Vault | `service_role_key` (pg_cron loop tick) |

Provider keys never ship to the browser; the service-role key exists only in
Fly secrets and the Vault.
