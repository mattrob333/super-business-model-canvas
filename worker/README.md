# Super BMC Worker

Node/TypeScript worker for Phase 2 agent jobs.

## Setup

```bash
cd worker
npm ci
cp .env.example .env
npm run typecheck
npm test
```

Required runtime env:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` (used by later Phase 2 job execution work)

Optional env:

- `WORKER_ID` defaults to `worker-<pid>`
- `POLL_INTERVAL_MS` defaults to `5000`
- `JOB_HEARTBEAT_STALE_SECONDS` defaults to `120`
- `JOB_MAX_ATTEMPTS` defaults to `3`
- `SECTION_ANALYSIS_MAX_TURNS` defaults to `40`
- `SECTION_ANALYSIS_TASK_BUDGET_TOKENS` defaults to `64000`
- `SECTION_ANALYSIS_MAX_BUDGET_USD` defaults to route-derived budget
- `WORKSPACE_CHAT_MAX_TURNS` defaults to `40`
- `WORKSPACE_CHAT_TASK_BUDGET_TOKENS` defaults to `32000`
- `WORKSPACE_CHAT_MAX_BUDGET_USD` defaults to route-derived budget
- `XAI_API_KEY` enables Grok live-search feeds
- `FIRECRAWL_API_KEY` enables Firecrawl scrape feeds
- `FRED_API_KEY` enables FRED macro-series feeds
- `GOOGLE_TRENDS_API_KEY` enables the Google Trends feed through the configured provider adapter
- `GITHUB_TOKEN` enables GitHub feed fetches

Run locally:

```bash
npm run dev
```
