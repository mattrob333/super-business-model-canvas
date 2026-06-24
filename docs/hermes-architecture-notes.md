# Hermes Architecture Notes for Enterprise Strategy Workspace

> Researched: 2025-06-24 | Source: https://hermes-agent.nousresearch.com/docs/

## 1. How Hermes Sessions Work

- **AIAgent loop** (`run_agent.py`): system prompt → LLM call → tool dispatch → result → repeat (max_turns=90 default)
- **Context compression**: auto-triggers near token limit (threshold 0.50, target_ratio 0.20)
- **Message role alternation enforced**: no two assistant or user messages in a row
- **Prompt caching**: tools/skills/system prompt changes require `/reset` to take effect
- **Session storage**: SQLite + FTS5 in `~/.hermes/state.db`

## 2. Tools & Toolsets

- 30+ toolsets; default bundle is `_HERMES_CORE_TOOLS`
- Tools are enabled per-platform; changes only apply on new session (`/reset`)
- Key toolsets: `terminal`, `file`, `web`, `browser`, `delegation`, `cronjob`, `skills`, `memory`, `computer_use`
- Tool registry auto-discovers `tools/*.py` files with `registry.register()`

## 3. Skills System

- **Location**: `~/.hermes/skills/` (user), bundled in repo, hub-installed
- **Format**: YAML frontmatter + Markdown, progressive disclosure
- **Agentskills.io** compatible
- Agent can `skill_manage` (create/patch/edit/delete) skills
- Curator auto-maintains skill lifecycle (pin/unpin/archive)
- Skills load on demand via `skill_view(name)` or cron `skills=[]` parameter
- External skill directories supported

## 4. Subagent Delegation (delegate_task)

- Spawns CHILD AIAgent instances with isolated context + terminal
- **No memory of parent conversation** — parent must pass everything in `goal` + `context`
- Single task: `goal` + `context` + `toolsets`
- Batch: up to 3 concurrent subagents by default
- Roles: `leaf` (no re-delegation) vs `orchestrator` (can spawn workers, bounded by `max_spawn_depth`)
- **Not durable**: if parent is interrupted, child is cancelled
- Config: `delegation.*` in config.yaml (model, provider, max_iterations, reasoning_effort)
- Toolsets restriction: child only gets tools listed in `toolsets` param
- **Children CANNOT use**: `clarify`, `memory`, `send_message`, `execute_code`

## 5. Cron Jobs (Scheduled Tasks)

- **Durable scheduler**: `cron/jobs.py` + `cron/scheduler.py`
- **Single tool**: `cronjob` with actions: create, list, update, pause, resume, remove, run
- **Schedules**: duration (`"30m"`), "every" phrase (`"every Monday 9am"`), 5-field cron (`"0 9 * * *"`), ISO timestamp
- **Fresh sessions**: each run gets a NEW session (no conversation memory)
- **Prompts must be self-contained** — cron sessions have zero context
- **Skills preloading**: `skills=["skill-a", "skill-b"]` on create; loaded in order each tick
- **Model pinning**: unpinned jobs snapshot current model/provider at creation; fail closed on global default change
- **Delivery**: auto, origin, all, or specific platform:chat:thread
- **Per-job knobs**: `model`, `provider`, `script` (pre-run), `context_from` (chain jobs), `workdir`, `enabled_toolsets`
- **No-agent mode**: `no_agent=True` + `script` — stdout delivered verbatim, zero LLM cost
- **Invariants**: 3-min hard interrupt, `.tick.lock` prevents duplicates, `skip_memory=True` by default
- **Recursive safety**: cron sessions should NOT create new cron jobs
- **Jobs with workdir may run sequentially**
- CLI: `hermes cron list|create|edit|pause|resume|run|remove|status`

## 6. MCP Integration

- **Client**: built-in, in `agent/mcp_client.py`
- **Transport**: stdio (subprocess), HTTP (remote), OAuth HTTP
- **Config**: `~/.hermes/mcp.yaml` (managed via `hermes mcp add/remove/list/test/configure`)
- **Tool discovery**: automatic at startup; tools become first-class tools in agent's toolset
- **Per-server filtering**: enable/disable individual tools via `hermes mcp configure <name>`
- **Catalog**: `hermes mcp install <name>` for Nous-approved servers
- **Tool risk**: read-only safe by default; mutating tools need explicit configuration
- **Browser cannot run stdio MCP servers** — must go through backend/runtime

## 7. Configuration & Secrets

- **config.yaml**: model, agent, terminal, compression, display, stt, tts, memory, security, delegation, checkpoints
- **.env**: API keys and secrets (separate from config)
- **credential pools**: rotate across multiple API keys per provider
- **auth.json**: OAuth tokens
- **Secret redaction**: ON by default — scans tool output for key-like strings, blocks `.env` file reads
- **PII redaction**: optional in gateway messages
- **Approvals**: `manual|smart|off` for destructive commands; `--yolo` bypass
- **Profiles**: isolated configs/sessions/skills/memory at `~/.hermes/profiles/<name>/`

## 8. Capabilities STABLE Enough to Use Directly

| Capability | Stable? | Notes |
|---|---|---|
| `terminal` tool | ✅ | Core tool, battle-tested |
| `file` tools (read/write/search/patch) | ✅ | Core tools |
| `cronjob` tool | ✅ | Mature scheduler |
| `delegate_task` | ✅ | Subagent spawning |
| `skill_view` / `skill_manage` | ✅ | Skill system |
| MCP (stdio/HTTP) | ✅ | Built-in client |
| `memory` tool | ✅ | Cross-session memory |
| `web_search` / `web_extract` | ⚠️ | Needs Firecrawl config |
| `browser` tools | ⚠️ | Needs Browserbase or local Chromium |
| `computer_use` | ✅ | Background desktop control |
| `execute_code` | ⚠️ | Sandboxed Python, Windows quirks |

## 9. Constraints to Design Around

1. **Cron sessions have no context** — agents must read DB/files for state; can't rely on conversation memory
2. **Cron runs should not create recursive crons** — violates the safety model
3. **Subagents are NOT durable** — use cron for long-running work
4. **Browser cannot run stdio MCP servers** — MCP must go through backend/runtime
5. **Secret redaction blocks reading .env files** — use terminal for env file inspection
6. **Tools/skills require `/reset` to apply** — mid-session changes are invisible
7. **3-minute hard interrupt per cron run** — large DB queries or multi-step agents need checkpointing
8. **No streaming from subagents** — only final summary returned
9. **Prompt caching is fragile** — changing tools/skills/system prompt mid-conversation breaks it

## 10. How This App Should Call Into Hermes

- **Hermes is the agent runtime, not the backend** — app owns all data
- **Adapter boundary**: `AgentRuntime` interface (TypeScript) that wraps Hermes calls
- **Hermes CLI spawning**: for fire-and-forget tasks: `hermes chat -q "..."` via terminal
- **Cron jobs**: created programmatically through the app backend using Hermes CLI
- **MCP**: configured in Hermes config; app reads/syncs approved MCP config
- **Skills**: stored in repo under `agent-skills/`; mirrored/installed into `~/.hermes/skills/`
- **Auth**: app handles Supabase auth; Hermes runs in app's context with app's API keys

## 11. Unverified Assumptions

- [ ] Whether Hermes can be invoked programmatically with a specific profile from Node.js backend
- [ ] Whether the app's Supabase Edge Functions can shell out to `hermes` CLI
- [ ] Token cost estimates for sustained cron loops (daily/weekly/monthly)
- [ ] Whether Hermes gateway can be used as an API endpoint from Supabase functions
- [ ] Max concurrent cron jobs and queuing behavior
- [ ] Whether `context_from` chaining works for multi-step agent pipelines
