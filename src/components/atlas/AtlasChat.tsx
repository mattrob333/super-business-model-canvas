import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lightbulb, Loader2, RefreshCw, Send } from "lucide-react";
import { parseAtlasActions } from "@/lib/atlas-actions";
import { AgentMarkdown } from "@/components/chat/AgentMarkdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAuth } from "@/hooks/useAuth";
import { loadCompanyScope } from "@/lib/company-scope";
import { ATLAS } from "@/lib/atlas";

/**
 * The War Room thread, dock edition (spec 12 §6): one durable
 * workspace_threads conversation with the orchestrator profile, shared later
 * with the full-screen War Room. Same durable-run chat loop as
 * WorkspaceThread — user message insert, workspace_chat run, poll until the
 * reply lands — but deliberately without the gap auto-send machinery: Atlas
 * speaks only when spoken to here.
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

const THREAD_TITLE = "War Room";
const RUN_POLL_INTERVAL_MS = 3_000;
const RUN_POLL_MAX_ATTEMPTS = 100; // ~5 minutes

/** Cross-company openers — Atlas reads all nine sections, so the prompts do too. */
const ATLAS_PROMPTS = [
  "Give me the state of the union.",
  "What single move matters most this week?",
  "Where am I losing to competitors right now?",
  "What information are you missing to steer better, and how do I get it?",
];

export function AtlasChat({
  accountId,
  agentProfileId,
  briefingSlot,
}: {
  accountId: string;
  agentProfileId: string;
  /** Rendered at the top of the scroll column — the briefing scrolls behind the pinned composer. */
  briefingSlot?: React.ReactNode;
}) {
  const { user } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadLoaded, setThreadLoaded] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const disposedRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      disposedRef.current = true;
      clearTimeout(pollTimer.current);
    },
    [],
  );

  // Find the existing War Room thread FOR THE ACTIVE COMPANY (each company
  // era gets its own — a previous company's strategy chat must never bleed
  // in); creation waits for the first send so an idle dock never writes rows.
  useEffect(() => {
    let cancelled = false;
    setThreadLoaded(false);
    (async () => {
      const scope = await loadCompanyScope(accountId).catch(() => null);
      let query = supabaseUntyped
        .from<ThreadRow>("workspace_threads")
        .select("id, title, created_at")
        .eq("account_id", accountId)
        .eq("agent_profile_id", agentProfileId)
        .eq("archived", false)
        .eq("title", THREAD_TITLE);
      if (scope) query = query.in("business_context_version_id", scope.contextIds);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1);
      if (cancelled) return;
      if (error) {
        setChatError(
          `Couldn't load the War Room thread: ${error.message}. Reload the page to try again.`,
        );
      }
      setThreadId(data?.[0]?.id ?? null);
      setThreadLoaded(true);
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

  const ensureThread = useCallback(async (): Promise<string> => {
    if (threadId) return threadId;
    // Stamped to the active company era; select-back verifies the insert
    // actually landed before we hang a run on it.
    const scope = await loadCompanyScope(accountId).catch(() => null);
    const { data, error } = await supabaseUntyped
      .from<ThreadRow>("workspace_threads")
      .insert({
        account_id: accountId,
        agent_profile_id: agentProfileId,
        title: THREAD_TITLE,
        business_context_version_id: scope?.activeContextId ?? null,
        created_by: user?.id ?? null,
      })
      .select("id, title, created_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create the War Room thread");
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
      const thread = await ensureThread();
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

  const lastMessage = messages[messages.length - 1];
  const unanswered = Boolean(lastMessage && lastMessage.role === "user" && !awaitingReply && !sending);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
      {briefingSlot}
      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          War Room
        </h3>
        <span className="text-[10px] text-muted-foreground">with {ATLAS.name}</span>
      </div>

      {/* Messages — natural height inside the dock's single scroll column */}
      <div className="flex-1 py-3">
        {!threadLoaded || loadingMessages ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 && !awaitingReply ? (
          <div className="space-y-3">
            {/* Atlas introduces itself — rendered, never written to the
                thread, so the real conversation starts with the user. */}
            <div className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/40">
                <ATLAS.icon className="h-3.5 w-3.5" />
              </span>
              <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed">
                <p>
                  I'm <strong>{ATLAS.name}</strong>, your chief strategist. I read your whole
                  canvas, your competitors, and your Gap Register — and my job is to hand you
                  the one move that matters most right now.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Start with your briefing above, or ask me anything below.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {ATLAS_PROMPTS.map((prompt) => (
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
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <AtlasMessage key={message.id} message={message} />
            ))}
            {awaitingReply && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atlas is thinking. This can take a minute…
              </div>
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
            className="max-h-40 min-h-[38px] flex-1 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
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
            className="mt-2 gap-1.5"
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
      <div className="max-w-[85%] break-words rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
        {text ?? JSON.stringify(message.content)}
      </div>
    </div>
  );
}
