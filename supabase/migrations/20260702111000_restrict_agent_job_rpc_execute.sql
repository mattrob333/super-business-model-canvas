-- Restrict Phase 2 worker queue RPCs to service-role callers only.
--
-- These functions are SECURITY DEFINER because they atomically claim/fail jobs
-- through the worker service. They must not be callable from anon/authenticated
-- browser sessions via the Data API.

revoke all on function public.claim_next_agent_job(text, integer, integer) from public;
revoke all on function public.claim_next_agent_job(text, integer, integer) from anon;
revoke all on function public.claim_next_agent_job(text, integer, integer) from authenticated;
grant execute on function public.claim_next_agent_job(text, integer, integer) to service_role;

revoke all on function public.fail_agent_job(uuid, text, text) from public;
revoke all on function public.fail_agent_job(uuid, text, text) from anon;
revoke all on function public.fail_agent_job(uuid, text, text) from authenticated;
grant execute on function public.fail_agent_job(uuid, text, text) to service_role;
