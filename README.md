# Super Business Model Canvas (Super BMC)

AI-powered strategy workspace built around a living Business Model Canvas. Enter a company URL, generate a full BMC and competitive landscape in about 60 seconds — then work the strategy with a team of ten AI agents: nine domain experts (one per BMC section) and **Atlas**, a chief-strategist orchestrator that reads all nine, runs playbook cascades, and keeps a ranked "what to do next" agenda.

**Live site:** [superbmc.com](https://superbmc.com)  
**Repository:** [github.com/mattrob333/super-business-model-canvas](https://github.com/mattrob333/super-business-model-canvas)

---

## The product direction (where this is going)

The canvas is the **shared source of truth**; everything else is a room built around it:

- **Section workspaces** — click any BMC section to enter that domain expert's full-screen room: agent avatar + context sources on the left, collaborative chat in the center, an actions panel of skills/templates/frameworks on the right (run manually, on a cron schedule, or triggered by Atlas). Spec: [`docs/specs/02_SECTION_WORKSPACE.md`](./docs/specs/02_SECTION_WORKSPACE.md)
- **The War Room** — Atlas's marquee workspace: the BMC rendered as a live command map (health, freshness, vs-competitor modes), strategist chat with delegation/brief/conflict cards, the Next Moves agenda, and the approvals queue. Spec: [`docs/specs/03_ORCHESTRATOR_WORKSPACE.md`](./docs/specs/03_ORCHESTRATOR_WORKSPACE.md)
- **Cascades** — sequenced multi-agent workflows (Competitor Delta Sweep, Board Pack, Pricing War Response, …) that produce cited reports and dashboard metrics on a cadence. Spec: [`docs/specs/04_ORCHESTRATION_AND_CASCADES.md`](./docs/specs/04_ORCHESTRATION_AND_CASCADES.md)

Start with [`docs/specs/00_OVERVIEW.md`](./docs/specs/00_OVERVIEW.md) for the full mental model and the agent roster.

## What the app does today

1. **Landing** — Email capture and sign-in entry point.
2. **Canvas** — Company analysis results: BMC grid, business overview, market competition, industry landscape.
3. **Dashboard** — Workspace overview wired to live data (gaps, agent runs, loops, reports, health score).
4. **Playbooks** — Run strategy frameworks against your saved company context.
5. **Settings** — Model routing, provider keys, MCP registry, scheduled loops, admin tools.

The frontend is a React SPA. All AI work runs on **Supabase Edge Functions** in the cloud — API keys never ship to the browser. (An agent-worker service is planned as the execution engine; see [`docs/AGENT_RUNTIME_DECISION.md`](./docs/AGENT_RUNTIME_DECISION.md).)

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Routing | React Router v6 |
| Data / auth | Supabase (Postgres, Auth, RLS) |
| AI backend | Supabase Edge Functions (Deno) |
| Models | xAI Grok (primary), OpenRouter, OpenAI, Anthropic (optional) |

---

## Prerequisites

- **Node.js 18+** and npm
- A **Supabase project** (free tier works)
- At least one **AI provider API key** (xAI recommended) stored in Supabase secrets

Optional (only for backend development):

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (required only if you run `supabase start` or `supabase functions serve` locally)

You do **not** need Docker to run `npm run dev` against your cloud Supabase project.

---

## Quick start (local development)

### 1. Clone and install

```bash
git clone https://github.com/mattrob333/super-business-model-canvas.git
cd super-business-model-canvas
npm install
```

### 2. Create `.env`

Copy `.env.example` to `.env` and fill in your Supabase values (Project Settings → API):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_HERMES_RUNTIME_ENDPOINT=https://your-project-ref.supabase.co/functions/v1/agent-run
```

> **Important:** `.env` is gitignored. You must recreate it on every machine. Never commit real keys.

The `XAI_API_KEY` and other provider keys in `.env.example` are documented for reference — in production they belong in **Supabase Edge Function secrets**, not in the frontend `.env`.

### 3. Set up Supabase (first time only)

Follow **[supabase/SETUP.md](./supabase/SETUP.md)**:

1. Run `supabase/schema.sql` in the SQL Editor
2. Run `supabase/seed_frameworks.sql`
3. Set edge-function secrets (`XAI_API_KEY`, etc.)
4. Deploy edge functions with the Supabase CLI

Current project ref (if using the existing cloud backend): `mehhuxzamnpxnkbrslls`

### 4. Run the dev server

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:8080`).

---

## Environment variables

### Frontend (`.env` — baked into the build at deploy time)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon/public key |
| `VITE_HERMES_RUNTIME_ENDPOINT` | Recommended | Live agent runtime URL (`.../functions/v1/agent-run`). Without it, Canvas uses a mock runtime. |
| `VITE_HERMES_RUNTIME_API_KEY` | No | Optional override; session JWT is used by default |

### Supabase secrets (server-side only)

Set in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Used for |
| --- | --- |
| `XAI_API_KEY` | Company analysis, BMC chat, competitor research, strategy coach |
| `OPENROUTER_API_KEY` | Framework reports and recommendations |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Agent runtime and optional direct provider calls |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

---

## Project structure

```
src/
  pages/           Route-level screens (Canvas, Playbooks, Dashboard, …)
  components/      UI components (canvas grid, layout shell, modals)
  hooks/           React hooks (auth, active analysis session)
  lib/             Helpers (agent runtime, supabase auth, active-analysis)
  integrations/    Supabase client
  data/            Framework seed data and report templates

supabase/
  schema.sql       Full database schema (run once in SQL Editor)
  seed_frameworks.sql
  functions/       Edge functions (analyze-company, bmc-chat, agent-run, …)
  migrations/      Incremental SQL patches
  SETUP.md         Backend setup guide

HANDOFF.md         Incoming build-agent handoff (state, rules, reading order)
```

---

## Main routes

| Path | Description |
| --- | --- |
| `/` | Public landing page |
| `/auth` | Sign in / sign up |
| `/canvas` | Company analysis + BMC (primary workspace view) |
| `/dashboard` | Workspace dashboard |
| `/playbooks` | Strategy framework library and report generation |
| `/my-analyses` | Saved analyses list |
| `/settings` | Account and model routing settings |
| `/admin` | Admin tools (framework editor) |

`/analyze` redirects to `/canvas`.

---

## AI architecture (summary)

Three lanes — full architecture detail in [docs/AGENT_RUNTIME_DECISION.md](./docs/AGENT_RUNTIME_DECISION.md) and [docs/DEVLOG.md](./docs/DEVLOG.md).

1. **Research & generation** — `analyze-company`, `research-competitors`, `generate-framework-report` (one-shot JSON)
2. **Streaming chat** — `bmc-chat`, `business-overview-chat`, `strategy-coach-chat`, `competitor-chat` (SSE)
3. **Agent runs** — `agent-run` via Hermes runtime (structured, logged to `agent_runs`)

All lanes call Supabase Edge Functions. The browser only holds the Supabase anon key and the user's session token.

---

## Building for production

```bash
npm run build
```

Output goes to `dist/`. Serve it as a static site with SPA fallback (all routes → `index.html`).

Preview the production build locally:

```bash
npm run preview
```

---

## Deploying to superbmc.com

### Why pushing to GitHub does not update the live site

GitHub stores your **source code**. superbmc.com serves a **built** copy of the app (compiled HTML/JS/CSS). Those are separate steps:

```
Code changes → git push → GitHub
                              ↓
                    build (npm run build)
                              ↓
                    deploy dist/ to host
                              ↓
                         superbmc.com
```

Pushing to `main` updates the repo. The live URL only changes after someone **builds and publishes** a new version to the hosting provider.

### Current hosting: Lovable

superbmc.com is currently served through **Lovable** (Cloudflare in front, Lovable analytics scripts in the HTML). The domain is connected to the original Lovable project:

`https://lovable.dev/projects/5520ad34-2e41-4f42-ad72-88d4d0c6c178`

**To publish the latest code to superbmc.com:**

1. Log in to [Lovable](https://lovable.dev)
2. Open the Super BMC project
3. Confirm the project is synced with this GitHub repo (`mattrob333/super-business-model-canvas`, branch `main`)
4. Set production environment variables in Lovable (same `VITE_*` values as your `.env`)
5. Click **Share → Publish** (not just preview)

> **Common pitfall:** Lovable can show the latest Git commit in page metadata while still serving an **older compiled JS bundle**. If the landing page looks unchanged or `/dashboard` 404s, the production publish step was not completed — republish from Lovable.

### Alternative hosts (recommended long-term)

You can move off Lovable to any static host:

| Host | Notes |
| --- | --- |
| **Vercel / Netlify** | Connect GitHub repo, set `VITE_*` env vars, auto-deploy on push |
| **Hostinger / cPanel** | Upload `dist/` folder, configure SPA rewrite to `index.html` |
| **Cloudflare Pages** | Git integration + env vars |

On any host, set the three `VITE_*` variables before building. AI will work as long as the Supabase project and edge-function secrets are configured.

### Deploying edge functions (backend)

Frontend deploy and backend deploy are independent:

```bash
supabase login
supabase link --project-ref mehhuxzamnpxnkbrslls
supabase functions deploy analyze-company
supabase functions deploy generate-framework-report
# … see supabase/SETUP.md for the full list
```

---

## Useful commands

```bash
npm run dev          # Local dev server
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm run lint         # ESLint

node scripts/generate-framework-seed.mjs   # Regenerate seed_frameworks.sql from JSON
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| AI analysis fails immediately | `XAI_API_KEY` missing or function not deployed | Set secret in Supabase, deploy `analyze-company` |
| Chat says "Not authenticated" | User not signed in | Sign in at `/auth` |
| Canvas Analyze does nothing | `VITE_HERMES_RUNTIME_ENDPOINT` unset | Add to `.env` and rebuild |
| Porter's Five Forces report empty | Schema mismatch | Run `supabase/migrations/20250701120000_fix_porter_report_schema.sql`, redeploy `generate-framework-report` |
| superbmc.com shows old UI | Production not republished | Publish from Lovable or redeploy `dist/` to your host |
| Works locally, not on live site | Missing `VITE_*` at build time | Set env vars in hosting dashboard, rebuild |

---

## Documentation

- **[supabase/SETUP.md](./supabase/SETUP.md)** — Database, secrets, edge-function deploy
- **[HANDOFF.md](./HANDOFF.md)** — Incoming build-agent handoff: current state, rules, reading order, first assignment
- **[docs/VISION.md](./docs/VISION.md)** — Product vision: the living Business Model Canvas
- **[docs/AGENT_RUNTIME_DECISION.md](./docs/AGENT_RUNTIME_DECISION.md)** — Agent runtime architecture decision record
- **[docs/ROADMAP.md](./docs/ROADMAP.md)** — Phased build plan (Phases 1–8)
- **[docs/BUILD_PLAN.md](./docs/BUILD_PLAN.md)** — Execution handoff for the AI build team: ground rules, phased work orders, acceptance criteria, review protocol
- **[docs/BUILD_STATE.md](./docs/BUILD_STATE.md)** — Live build tracker (status board, blockers, operator queue, review findings)
- **[docs/DEVLOG.md](./docs/DEVLOG.md)** — Dev log: audits, fixes, current state
- **[docs/specs/00_OVERVIEW.md](./docs/specs/00_OVERVIEW.md)** — Agent workspaces: reading guide + mental model
- **[docs/specs/01_AGENT_ROSTER.md](./docs/specs/01_AGENT_ROSTER.md)** — The ten agents: personas, tools, outputs, synergies
- **[docs/specs/02_SECTION_WORKSPACE.md](./docs/specs/02_SECTION_WORKSPACE.md)** — Section agent workspace UI spec
- **[docs/specs/03_ORCHESTRATOR_WORKSPACE.md](./docs/specs/03_ORCHESTRATOR_WORKSPACE.md)** — The War Room (Atlas) UI spec
- **[docs/specs/04_ORCHESTRATION_AND_CASCADES.md](./docs/specs/04_ORCHESTRATION_AND_CASCADES.md)** — Delegation, scheduling, cascades, data model
- **[docs/specs/05_METRICS_AND_DATA_FEEDS.md](./docs/specs/05_METRICS_AND_DATA_FEEDS.md)** — Public-data metrics, KPIs/benchmarks, data feeds, competitor BMC drill-down
- **[docs/specs/06_MODEL_ROUTING_ECONOMICS.md](./docs/specs/06_MODEL_ROUTING_ECONOMICS.md)** — Model-per-task routing, OpenRouter model-scout, cost controls
- **[docs/specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md](./docs/specs/07_CLAUDE_AGENT_SDK_INTEGRATION.md)** — Claude Agent SDK integration guide for the worker (verified API usage)

---

## License

Private project. All rights reserved.
