-- Phase 7: Runtime config persistence
-- Add runtime_config JSONB column to accounts table for persisting
-- AgentRuntime configuration (concurrency, timeout, logging, lifecycle, sandbox).

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS runtime_config jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN accounts.runtime_config IS 'Persisted AgentRuntime configuration (maxConcurrentRuns, executionTimeoutMinutes, loggingVerbosity, agentLifecyclePolicy, sandboxEnabled). Managed via Settings > Hermes Runtime tab.';
