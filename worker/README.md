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

Run locally:

```bash
npm run dev
```
