# Super BMC — Supabase Rebuild Guide

This guide walks you through rebuilding the Supabase backend from scratch after
recreating (or replacing) your Supabase project. Follow the steps in order.

---

## 0. Before you start

You'll need:

- A Supabase project (free tier is fine). Note its **Project URL** and
  **anon/publishable key** (Project Settings → API).
- At least one AI provider API key (see [Step 3](#3-set-edge-function-secrets)).

If this is a brand-new Supabase project, its `project_id` will differ from the
one in `supabase/config.toml`. Update that value to match your new project ref
(you can find it in your project's URL: `https://<project-ref>.supabase.co`).

---

## 1. Run the schema

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, copy **all** of it, paste into the
   editor, and click **Run**.

This creates every table, enum, helper function, index, Row Level Security
(RLS) policy, the auto-provisioning trigger, and seeds the 10 template agent
profiles + the 4 default model routes.

The script is **idempotent** — running it twice is safe.

## 2. Seed the frameworks ("skills")

1. Still in the SQL Editor → **New query**.
2. Open `supabase/seed_frameworks.sql`, copy all of it, paste, and **Run**.

This loads the 10 default strategy frameworks (SWOT, Porter's Five Forces,
Business Model Canvas, PESTLE, Ansoff, McKinsey 7S, Value Chain, BCG, Balanced
Scorecard, Blue Ocean) as active, playbook-visible skills.

> To regenerate this file after editing `src/data/initial-frameworks.json`, run
> `node scripts/generate-framework-seed.mjs`.

---

## 3. Set edge-function secrets

The AI features run in Supabase **Edge Functions**, which read their API keys
from project secrets (NOT from the `.env` file — that's only for the frontend).

Set secrets in **Project Settings → Edge Functions → Secrets**, or with the CLI:

```bash
supabase secrets set XAI_API_KEY=xai-xxxxxxxx
# Optional extra providers (agent runtime + framework reports):
supabase secrets set OPENAI_API_KEY=sk-xxxxxxxx
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
supabase secrets set OPENROUTER_API_KEY=sk-or-xxxxxxxx
```

Which key powers what:

| Secret | Used by | Needed for |
| --- | --- | --- |
| `XAI_API_KEY` | `analyze-company`, `business-overview-chat`, `research-competitors`, `strategy-coach-chat`, `bmc-chat`, `competitor-chat` | **Company analysis** and most chat features |
| `OPENROUTER_API_KEY` | `recommend-frameworks`, `generate-framework-report` | Framework reports + recommendations (routes models like `google/gemini-2.5-flash`) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | `agent-run`, `generate-framework-report` | The Hermes agent runtime and optional direct provider calls |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically by Supabase — you do **not** need to set those.

> **Why AI generation may have been failing:** `analyze-company` needs
> `XAI_API_KEY` set **and** the function deployed. Without the key it returns an
> error; the app now surfaces that exact message in the "Analysis Failed" toast.

---

## 4. Deploy the edge functions

```bash
# From the repo root, logged in with: supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy analyze-company
supabase functions deploy agent-run
supabase functions deploy bmc-chat
supabase functions deploy business-overview-chat
supabase functions deploy competitor-chat
supabase functions deploy recommend-frameworks
supabase functions deploy generate-framework-report
supabase functions deploy strategy-coach-chat
supabase functions deploy research-competitors
supabase functions deploy scheduled-loop-tick
```

(You can skip `seed-frameworks` — it targets the old dropped table and is no
longer used; framework seeding is done in Step 2.)

---

## 5. Point the frontend at your project

Edit `.env` in the repo root:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
```

Then restart the dev server (`npm run dev`).

---

## 6. Sign up once

Create an account in the app. On your first login, the `handle_new_user`
trigger automatically:

1. Creates your **profile**.
2. Creates a personal **account** (workspace).
3. Adds you as the **owner**.
4. Clones the 10 template **agent profiles** into your account.
5. Copies the 4 default **model routes** into your account.

At that point the Canvas, Agents, Playbooks, and Model Routing screens all have
data and the app is fully wired.

### Make yourself an admin (optional)

Admin-only screens (Frameworks editor, Leads) require the `admin` role. After
signing up, grant it in the SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com'
on conflict (user_id, role) do nothing;
```

---

## What changed in this rebuild

- **One consolidated `schema.sql`** replaces the pile of incremental migrations.
- **Account auto-provisioning is fixed** — new users now get an account,
  membership, agents, and routes (previously nothing created these, so the
  whole agent/canvas layer was inert).
- **`model_routes` table** — model routing tiers (premium/standard/economy/
  local) now live in the database and are editable per workspace, instead of a
  hardcoded map. OpenRouter is supported, so you can point any tier at any model.
- **Frameworks are the skill registry**, plus a new **`agent_skills`** join
  table (which skills each agent may call) and a **`skills`** view for the
  runtime.
- **Dead tables dropped:** `strategic_frameworks`, `strategy_sessions`,
  `framework_executions`.
- **Cleaner, faster RLS** via the `is_account_member()` helper.
