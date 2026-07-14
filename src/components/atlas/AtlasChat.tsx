import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, History, Lightbulb, Loader2, MessageSquarePlus, Play, RefreshCw, Send, Workflow } from "lucide-react";
import { parseAtlasActions } from "@/lib/atlas-actions";
import { AgentMarkdown } from "@/components/chat/AgentMarkdown";
import { A2uiSurface } from "@/components/a2ui/A2uiSurface";
import { useA2uiSurfaces } from "@/components/a2ui/useA2uiSurfaces";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAuth } from "@/hooks/useAuth";
import { useDataRichness } from "@/hooks/useDataRichness";
import { loadCompanyScope } from "@/lib/company-scope";
import { ATLAS } from "@/lib/atlas";
import { RUNNABLE_WORKFLOWS } from "@/lib/brain";

/**
 * The War Room chat (spec 12 §6), shared by the dock and the full-screen War
 * Room. Same durable-run chat loop as WorkspaceThread — user message insert,
 * workspace_chat run, poll until the reply lands — but deliberately without
 * the gap auto-send machinery: Atlas speaks only when spoken to here.
 *
 * Thread model matches the section rooms: arriving always opens a FRESH chat
 * (the greeting + suggested openers), the first message names the thread, and
 * past conversations — including legacy "War Room"-titled threads — live one
 * click away in the History popover.
 */

interface ThreadRow {
  id: string;
  title: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  role: string;
  kind: string;
  content: Record<string, unknown>;
  created_at: string;
}

const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100; // ~5 minutes
// Workflow watching polls the DURABLE workflow_runs table, not component
// state (owner finding 2026-07-14: a dock remount went blind to an in-flight
// run — no progress, no double-launch guard, duplicate runs). Any surface
// discovers the active run on mount and resumes watching.
const WORKFLOW_WATCH_INTERVAL_MS = 5_000;
const WORKFLOW_WATCH_MAX_TICKS = 360; // ~30 minutes
// A just-launched job sits queued until the worker claims it and creates the
// durable run row — keep optimistic state alive this long before giving up.
const WORKFLOW_PENDING_GRACE_TICKS = 36; // ~3 minutes
const HISTORY_LIMIT = 15;

/** Thread handoff key: the dock stashes the launch thread, the War Room opens it. */
const OPEN_THREAD_KEY = "atlas:open-thread";

interface ActiveWorkflow {
  threadId: string | null;
  workflowId: string | null;
  title: string;
  /** True until the durable workflow_runs row has been seen. */
  optimistic: boolean;
}

function workflowTitle(workflowId: string | null): string {
  return RUNNABLE_WORKFLOWS.find((workflow) => workflow.id === workflowId)?.title ?? "workflow";
}

/** New threads take their name from the opening message, like any chat app. */
function threadTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean || "New chat";
}

/** Cross-company openers — Atlas reads all nine sections, so the prompts do too. */
const ATLAS_PROMPTS = [
  "Give me the state of the union.",
  "What single move matters most this week?",
  "Where am I losing to competitors right now?",
  "What information are you missing to steer better, and how do I get it?",
];

/** Openers for a board rich enough to talk strategy from day one. */
const RICH_PROMPTS = [
  "Give me the state of the union.",
  "Where am I most exposed to competitors right now?",
  "What single move matters most this week?",
];

/** Openers for a thin board — Atlas coaches ground truth in, first. */
const SPARSE_PROMPTS = [
  "Interview me — ask what you need to know about my business.",
  "What should a company at my stage prove first?",
  "Help me get my documents and knowledge in.",
];

export function AtlasChat({
  accountId,
  agentProfileId,
  briefingSlot,
  fullPageOnWorkflow = false,
}: {
  accountId: string;
  agentProfileId: string;
  /** Rendered at the top of the scroll column — the briefing scrolls behind the pinned composer. */
  briefingSlot?: React.ReactNode;
  /** Dock mode: launching a workflow hands the thread to the full War Room. */
  fullPageOnWorkflow?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const richness = useDataRichness(accountId);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow | null>(null);
  const [workflowsOpen, setWorkflowsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const disposedRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  const workflowTimer = useRef<ReturnType<typeof setTimeout>>();
  const threadIdRef = useRef<string | null>(null);
  threadIdRef.current = threadId;
  const activeWorkflowRef = useRef<ActiveWorkflow | null>(null);
  activeWorkflowRef.current = activeWorkflow;
  const surfaces = useA2uiSurfaces(messages);

  useEffect(
    () => () => {
      disposedRef.current = true;
      clearTimeout(pollTimer.current);
      clearTimeout(workflowTimer.current);
    },
    [],
  );

  /** The single source of truth for "is a workflow running": the durable table. */
  const findActiveRun = useCallback(async () => {
    const { data } = await supabaseUntyped
      .from<{ id: string; workflow_id: string; thread_id: string | null; status: string }>("workflow_runs")
      .select("id, workflow_id, thread_id, status")
      .eq("account_id", accountId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  }, [accountId]);

  // Load recent Atlas threads FOR THE ACTIVE COMPANY (each company era keeps
  // its own — a previous company's strategy chat must never bleed in) to fill
  // the History popover. Arriving never auto-opens one: the chat starts fresh
  // (greeting + openers), and thread creation waits for the first send so an
  // idle dock never writes rows. Legacy "War Room"-titled threads stay
  // reachable here — they are ordinary threads for the same profile in scope.
  useEffect(() => {
    let cancelled = false;
    setThreads([]);
    setThreadId(null);
    (async () => {
      const scope = await loadCompanyScope(accountId).catch(() => null);
      let query = supabaseUntyped
        .from<ThreadRow>("workspace_threads")
        .select("id, title, created_at")
        .eq("account_id", accountId)
        .eq("agent_profile_id", agentProfileId)
        .eq("archived", false);
      if (scope) query = query.in("business_context_version_id", scope.contextIds);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (error) {
        // History failing to load must not read as "no chats": say so, and
        // point at what still works.
        setChatError(
          `Couldn't load chat history: ${error.message}. You can still start a new chat below, or reload the page to try again.`,
        );
      }
      setThreads(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, agentProfileId]);

  const loadMessages = useCallback(async (thread: string) => {
    const { data, error } = await supabaseUntyped
      .from<MessageRow>("workspace_messages")
      .select("id, role, kind, content, created_at")
      .eq("thread_id", thread)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) {
      // Keep whatever is already on screen; an honest error beats a silent wipe.
      setChatError(
        `Couldn't refresh the conversation: ${error.message}. Your messages are safe — reload the page to try again.`,
      );
      return;
    }
    setMessages(data ?? []);
  }, []);

  useEffect(() => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    void loadMessages(threadId).finally(() => {
      if (!cancelled) setLoadingMessages(false);
    });
    return () => {
      cancelled = true;
    };
  }, [threadId, loadMessages]);

  useEffect(() => {
    if (messages.length === 0 && !awaitingReply) return;
    // block:"nearest" keeps the scroll inside the dock's own container —
    // scrolling the page under a fixed dock would be disorienting.
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, awaitingReply]);

  const ensureThread = useCallback(async (titleHint?: string): Promise<string> => {
    if (threadId) return threadId;
    // Named from the opening message like every other room; stamped to the
    // active company era; select-back verifies the insert actually landed
    // before we hang a run on it.
    const scope = await loadCompanyScope(accountId).catch(() => null);
    const { data, error } = await supabaseUntyped
      .from<ThreadRow>("workspace_threads")
      .insert({
        account_id: accountId,
        agent_profile_id: agentProfileId,
        title: titleHint ? threadTitleFrom(titleHint) : "New chat",
        business_context_version_id: scope?.activeContextId ?? null,
        created_by: user?.id ?? null,
      })
      .select("id, title, created_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create the War Room thread");
    setThreads((prev) => [data, ...prev]);
    setThreadId(data.id);
    return data.id;
  }, [accountId, agentProfileId, threadId, user]);

  const pollRun = useCallback((runId: string, thread: string, attempt: number) => {
    if (attempt >= RUN_POLL_MAX_ATTEMPTS) {
      setAwaitingReply(false);
      setChatError(
        `${ATLAS.name} is taking longer than expected. The run continues in the background. Check the Activity page or reload shortly.`,
      );
      return;
    }
    getAgentRuntime(accountId)
      .getRunStatus(runId)
      .then((status) => {
        if (disposedRef.current) return;
        if (!status || status.status === "pending" || status.status === "running") {
          pollTimer.current = setTimeout(() => pollRun(runId, thread, attempt + 1), RUN_POLL_INTERVAL_MS);
          return;
        }
        setAwaitingReply(false);
        if (status.status === "completed") {
          void loadMessages(thread);
        } else {
          setChatError(
            status.error
              ? `${ATLAS.name} hit an error: ${status.error} — use “Ask again” below to retry, or check the Activity page for details.`
              : `The run ended (${status.status}) without a reply. Use “Ask again” below to retry, or check the Activity page.`,
          );
        }
      })
      .catch(() => {
        if (disposedRef.current) return;
        pollTimer.current = setTimeout(() => pollRun(runId, thread, attempt + 1), RUN_POLL_INTERVAL_MS);
      });
  }, [accountId, loadMessages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || awaitingReply) return;
    setSending(true);
    setChatError(null);
    try {
      const thread = await ensureThread(trimmed);
      const { error: messageError } = await supabaseUntyped.from("workspace_messages").insert({
        thread_id: thread,
        role: "user",
        kind: "text",
        content: { text: trimmed },
      });
      if (messageError) throw new Error(messageError.message);
      setDraft("");
      await loadMessages(thread);

      const { runId } = await getAgentRuntime(accountId).startRun({
        agentProfileId,
        accountId,
        runType: "workspace_chat",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: { thread_id: thread },
      });
      setAwaitingReply(true);
      pollRun(runId, thread, 0);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? `Couldn't send that: ${error.message}. Try again in a moment.`
          : "Couldn't reach the agent runtime. Check your connection and try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  }, [accountId, agentProfileId, awaitingReply, ensureThread, loadMessages, pollRun, sending, user]);

  // Recovery for a message Atlas never answered (page left mid-run, engine
  // restart, failed run): re-run the thread WITHOUT duplicating the user
  // message — the chat job replays the whole thread anyway.
  const retryReply = useCallback(async () => {
    if (!threadId || sending || awaitingReply) return;
    setChatError(null);
    try {
      const { runId } = await getAgentRuntime(accountId).startRun({
        agentProfileId,
        accountId,
        runType: "workspace_chat",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: { thread_id: threadId },
      });
      setAwaitingReply(true);
      pollRun(runId, threadId, 0);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? `Couldn't restart the reply: ${error.message}. Try “Ask again” in a moment.`
          : "Couldn't reach the agent runtime. Check your connection and try “Ask again” in a moment.",
      );
    }
  }, [accountId, agentProfileId, awaitingReply, pollRun, sending, threadId, user]);

  // Mount discovery: an in-flight run must survive remounts, navigation, and
  // second surfaces. Read the thread handoff (dock → War Room), then check
  // the durable table; an ACTIVE run's thread beats the fresh-chat default —
  // live work is exactly what the user came to see.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    try {
      const handoff = sessionStorage.getItem(OPEN_THREAD_KEY);
      if (handoff) {
        sessionStorage.removeItem(OPEN_THREAD_KEY);
        // The handoff carries the just-launched workflow too, so the pending
        // phase (job queued, durable row not yet created) shows the running
        // notice instead of a false "Atlas never replied".
        try {
          const parsed = JSON.parse(handoff) as { threadId?: string; workflowId?: string; title?: string };
          if (parsed.threadId) setThreadId(parsed.threadId);
          if (parsed.workflowId) {
            setActiveWorkflow({
              threadId: parsed.threadId ?? null,
              workflowId: parsed.workflowId,
              title: parsed.title ?? workflowTitle(parsed.workflowId),
              optimistic: true,
            });
          }
        } catch {
          setThreadId(handoff); // legacy plain thread id
        }
      }
    } catch {
      // Blocked storage: discovery below still finds the active run.
    }
    (async () => {
      const row = await findActiveRun().catch(() => null);
      if (cancelled || disposedRef.current || !row) return;
      setActiveWorkflow({
        threadId: row.thread_id,
        workflowId: row.workflow_id,
        title: workflowTitle(row.workflow_id),
        optimistic: false,
      });
      if (row.thread_id && !threadIdRef.current) setThreadId(row.thread_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, findActiveRun]);

  // The watcher: while a workflow is active, reload its thread every tick so
  // the run card and step cards materialize as they land; when the durable
  // row goes terminal, report failures honestly and catch the synthesis
  // sweep's findings with two delayed reloads.
  const watching = activeWorkflow !== null;
  useEffect(() => {
    if (!watching || !accountId) return;
    let cancelled = false;
    let ticks = 0;

    const finish = async () => {
      const watched = activeWorkflowRef.current;
      setActiveWorkflow(null);
      const { data } = await supabaseUntyped
        .from<{ status: string; error: string | null; workflow_id: string }>("workflow_runs")
        .select("status, error, workflow_id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || disposedRef.current) return;
      const last = data?.[0];
      if (last?.status === "failed" && last.error) {
        setChatError(`The ${workflowTitle(last.workflow_id)} workflow stopped: ${last.error}`);
      }
      const reloadThread = watched?.threadId ?? threadIdRef.current;
      if (reloadThread) {
        void loadMessages(reloadThread);
        workflowTimer.current = setTimeout(() => {
          if (!cancelled && !disposedRef.current) void loadMessages(reloadThread);
        }, 15_000);
      }
    };

    const tick = async () => {
      if (cancelled || disposedRef.current) return;
      ticks += 1;
      const current = activeWorkflowRef.current;
      if (current?.threadId && current.threadId === threadIdRef.current) {
        void loadMessages(current.threadId);
      }
      const row = await findActiveRun().catch(() => undefined);
      if (cancelled || disposedRef.current) return;
      if (row) {
        if (current?.optimistic || current?.workflowId !== row.workflow_id) {
          setActiveWorkflow({
            threadId: row.thread_id,
            workflowId: row.workflow_id,
            title: workflowTitle(row.workflow_id),
            optimistic: false,
          });
        }
      } else if (row === null && !(current?.optimistic && ticks < WORKFLOW_PENDING_GRACE_TICKS)) {
        // No active row (and past the just-launched grace window) → done.
        void finish();
        return;
      }
      if (ticks >= WORKFLOW_WATCH_MAX_TICKS) {
        setActiveWorkflow(null);
        setChatError("The workflow is taking longer than expected. It continues in the background — reload in a few minutes.");
        return;
      }
      workflowTimer.current = setTimeout(() => void tick(), WORKFLOW_WATCH_INTERVAL_MS);
    };

    workflowTimer.current = setTimeout(() => void tick(), WORKFLOW_WATCH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(workflowTimer.current);
    };
  }, [watching, accountId, findActiveRun, loadMessages]);

  const launchWorkflow = useCallback(async (workflow: { id: string; title: string }) => {
    if (sending || activeWorkflowRef.current) return;
    setWorkflowsOpen(false);
    setChatError(null);
    setSending(true);
    try {
      const thread = await ensureThread(`Run ${workflow.title}`);
      // The launch narrates in chat like any other action — the run card that
      // follows is the agent's reply.
      const { error: messageError } = await supabaseUntyped.from("workspace_messages").insert({
        thread_id: thread,
        role: "user",
        kind: "text",
        content: { text: `Run the ${workflow.title} workflow.` },
      });
      if (messageError) throw new Error(messageError.message);
      await loadMessages(thread);
      await getAgentRuntime(accountId).startRun({
        agentProfileId,
        accountId,
        runType: "workflow_run",
        triggerType: "manual",
        triggeredBy: user?.id ?? null,
        input: { workflow_id: workflow.id, thread_id: thread },
      });
      setActiveWorkflow({ threadId: thread, workflowId: workflow.id, title: workflow.title, optimistic: true });
      if (fullPageOnWorkflow) {
        // The dock is too small for a live run — hand the thread AND the
        // optimistic run state to the full War Room.
        try {
          sessionStorage.setItem(
            OPEN_THREAD_KEY,
            JSON.stringify({ threadId: thread, workflowId: workflow.id, title: workflow.title }),
          );
        } catch {
          // Blocked storage: the War Room's mount discovery still finds it.
        }
        navigate("/war-room");
      }
    } catch (error) {
      setChatError(
        error instanceof Error
          ? `Couldn't start the workflow: ${error.message}. Try again in a moment.`
          : "Couldn't reach the agent runtime. Check your connection and try again in a moment.",
      );
    } finally {
      setSending(false);
    }
  }, [accountId, agentProfileId, ensureThread, fullPageOnWorkflow, loadMessages, navigate, sending, user]);

  const lastMessage = messages[messages.length - 1];
  // A pending workflow is not an unanswered message — the run card (or the
  // running-workflow notice) is the reply.
  const unanswered = Boolean(lastMessage && lastMessage.role === "user" && !awaitingReply && !sending && !activeWorkflow);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4">
      {briefingSlot}
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          War Room
        </h3>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">with {ATLAS.name}</span>
          <Popover open={workflowsOpen} onOpenChange={setWorkflowsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label="Run a workflow"
                title="Run a workflow"
              >
                <Workflow className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workflows
              </p>
              {RUNNABLE_WORKFLOWS.map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  disabled={Boolean(activeWorkflow) || sending}
                  onClick={() => void launchWorkflow(workflow)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block font-medium">{workflow.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{workflow.outcome}</span>
                  </span>
                </button>
              ))}
              {activeWorkflow && (
                <p className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">
                  The {activeWorkflow.title} workflow is already running — one at a time.
                </p>
              )}
            </PopoverContent>
          </Popover>
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label="Chat history"
                title="Chat history"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <button
                type="button"
                onClick={() => {
                  setThreadId(null);
                  setHistoryOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted/60"
              >
                <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                New chat
              </button>
              <p className="mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                History
              </p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setThreadId(thread.id);
                      setHistoryOpen(false);
                    }}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      thread.id === threadId ? "bg-muted font-medium" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="block truncate">{thread.title ?? "Untitled chat"}</span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      {new Date(thread.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </button>
                ))}
                {threads.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No chats with {ATLAS.name} for this company yet.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Messages — natural height inside the dock's single scroll column */}
      <div className="flex-1 py-3">
        {loadingMessages ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 && !awaitingReply ? (
          <div className="space-y-3">
            {/* Atlas introduces itself — rendered, never written to the
                thread, so the real conversation starts with the user. The
                copy adapts to the board: a rich board gets the strategist,
                a thin one gets the onboarding coach. */}
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/40">
                <ATLAS.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed">
                <p>
                  I'm <strong>{ATLAS.name}</strong>, your chief strategist.{" "}
                  {richness === "rich"
                    ? "I've read your canvas and your competitive field is loading. My job: hand you the one move that matters most right now."
                    : richness === "sparse"
                      ? "Public data on your company is thin — normal at your stage, and it means YOU are my best source. Let's build your ground truth together."
                      : "I read your whole canvas, your competitors, and your Gap Register — and my job is to hand you the one move that matters most right now."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Start with your briefing above, or ask me anything below.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {(richness === "rich" ? RICH_PROMPTS : richness === "sparse" ? SPARSE_PROMPTS : ATLAS_PROMPTS).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="flex w-full items-start gap-2 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/35 hover:bg-muted/40"
                >
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {prompt}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Or run a full workflow
              </p>
              {activeWorkflow && (
                <button
                  type="button"
                  onClick={() => activeWorkflow.threadId && setThreadId(activeWorkflow.threadId)}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10"
                >
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <span className="min-w-0">
                    The {activeWorkflow.title} workflow is running
                    {activeWorkflow.threadId ? " — open its chat to watch." : "."}
                  </span>
                </button>
              )}
              <div className="space-y-1.5">
                {RUNNABLE_WORKFLOWS.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    disabled={Boolean(activeWorkflow) || sending}
                    onClick={() => void launchWorkflow(workflow)}
                    className="flex w-full items-start gap-2 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/35 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-medium">{workflow.title}</span>
                      <span className="block text-muted-foreground">{workflow.outcome}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              // a2ui rows fold into one live surface, rendered at the row
              // where the surface first appeared; later rows only feed state.
              if (message.kind === "a2ui") {
                const surface = [...surfaces.values()].find((candidate) => candidate.anchorRowId === message.id);
                if (!surface) return null;
                return <A2uiSurface key={message.id} surface={surface} accountId={accountId} />;
              }
              return <AtlasMessage key={message.id} message={message} />;
            })}
            {awaitingReply && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atlas is thinking. This can take a minute…
              </div>
            )}
            {activeWorkflow && (
              activeWorkflow.threadId === threadId ? (
                <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs" role="status">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                  <span className="min-w-0">
                    The {activeWorkflow.title} workflow is running — step cards land here as they finish.
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    The {activeWorkflow.title} workflow is running in another chat.
                  </span>
                  {activeWorkflow.threadId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => setThreadId(activeWorkflow.threadId)}
                    >
                      Watch it
                    </Button>
                  )}
                </div>
              )
            )}
            {unanswered && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span>Atlas never replied to this one.</span>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void retryReply()}>
                  <RefreshCw className="h-3 w-3" />
                  Ask again
                </Button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      </div>

      {chatError && (
        <div
          className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-relaxed text-destructive"
          role="alert"
        >
          {chatError}
        </div>
      )}

      {/* Composer — pinned to the panel bottom; the column scrolls behind it */}
      <form
        className="shrink-0 border-t border-border bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(draft);
        }}
      >
        <div className="flex items-end gap-1.5 rounded-lg border border-border bg-background p-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/25">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(draft);
              }
            }}
            placeholder={`Message ${ATLAS.name}…`}
            rows={1}
            className="max-h-40 min-h-[38px] min-w-0 flex-1 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-md"
            disabled={sending || awaitingReply || !draft.trim()}
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AtlasMessage({ message }: { message: MessageRow }) {
  const navigate = useNavigate();
  const text = typeof message.content?.text === "string" ? message.content.text : null;

  if (message.role === "agent") {
    const { clean, actions } = parseAtlasActions(text ?? "");
    return (
      <div>
        <AgentMarkdown text={clean} />
        {actions.map((action) => (
          <Button
            key={`${message.id}:${action.room}:${action.label}`}
            size="sm"
            // h-auto/min-h + whitespace-normal: agent-written labels wrap
            // inside the chat column instead of nowrap-overflowing the screen
            // on mobile. Fitting labels render at the same 36px as before.
            className="mt-2 h-auto min-h-9 max-w-full gap-1.5 whitespace-normal py-1.5 text-left"
            onClick={() => {
              // Same delegation contract as the briefing CTA: stash the
              // directive, open the room, the agent acknowledges the task.
              try {
                sessionStorage.setItem(
                  "atlas:handoff",
                  JSON.stringify({ room: action.room, action: action.action, skillTitle: action.skillTitle }),
                );
              } catch {
                // Blocked storage: the room still opens, just without the brief.
              }
              navigate(`/workspace/${action.room}?from=atlas`);
            }}
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="min-w-0 max-w-[85%] break-words rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
        {text ?? JSON.stringify(message.content)}
      </div>
    </div>
  );
}
