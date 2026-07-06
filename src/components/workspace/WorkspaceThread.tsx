import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckCircle2, ChevronDown, Lightbulb, Loader2, MessageSquarePlus, Pencil, Send, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { getAgentRuntime } from "@/lib/agent-runtime";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CANVAS_SECTION_LABELS, LEGACY_SECTION_KEYS } from "@/components/canvas/section-types";
import { getActiveAnalysisCanvas } from "@/lib/active-analysis";
import { AGENT_ROSTER } from "@/lib/agent-roster";

/**
 * Spec 02 zone 2 — the collaboration surface, slice 1: persistent threads
 * (default "Open floor"), human/agent text cards, proposal cards (borrowed
 * competitor ideas land here), and a composer wired to the real
 * `workspace_chat` worker job. The run is a durable agent_runs row; its
 * status is polled until the agent's reply message appears. Tool-call and
 * artifact cards, slash commands, and streaming arrive in later slices.
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

/**
 * Every room closes with this opener: the agent's job includes auditing its
 * own blind spots and coaching the user through closing them (owner
 * directive 2026-07-06 — data gaps are onboarding, not dead ends).
 */
const MISSING_DATA_PROMPT =
  "What information are you missing to give me your best advice — and how do I get it?";

/** Domain-specific openers per room — a generic prompt gets a generic answer. */
const SUGGESTED_PROMPTS: Record<string, string[]> = {
  key_partners: [
    "Which partnership are we most dependent on, and what's our exposure if it ends?",
    "What partnership do our competitors have that we should counter or copy?",
    "Which of our partners could become a channel, not just a supplier?",
  ],
  key_activities: [
    "Which activity here actually differentiates us, and which is just table stakes?",
    "What are we doing in-house that the market now sells as a service?",
    "Where would one more hire or tool most increase our shipping speed?",
  ],
  key_resources: [
    "Which resource is our real moat, and how defensible is it honestly?",
    "Where is our single point of failure — a person, supplier, or platform?",
    "What resource would a well-funded competitor find hardest to replicate?",
  ],
  value_propositions: [
    "Which value prop here would a skeptical buyer challenge first?",
    "How does our strongest claim compare to what competitors promise?",
    "Which proposition lacks evidence, and what proof would close that?",
  ],
  customer_relationships: [
    "Where in the customer lifecycle are we most likely losing people?",
    "Which relationship motion should we automate, and which must stay human?",
    "What would make our customers actively recommend us?",
  ],
  channels: [
    "Which channel earns us customers cheapest, and are we over-invested elsewhere?",
    "What channel are competitors using that we're ignoring?",
    "If we could only keep two channels, which two and why?",
  ],
  customer_segments: [
    "Which segment here is most profitable versus most demanding?",
    "What adjacent segment could we serve with what we already have?",
    "Which segment is drifting away from us, and what's the signal?",
  ],
  cost_structure: [
    "Which cost line grows faster than revenue, and can we break that link?",
    "Where could we cut 15% without customers noticing?",
    "Which cost is actually an investment we should protect?",
  ],
  revenue_streams: [
    "Are we over-concentrated in one revenue stream, and how risky is that?",
    "Which stream has pricing power we haven't used?",
    "What recurring-revenue motion fits our current customers best?",
  ],
};

export function WorkspaceThread({
  accountId,
  agentProfileId,
  sectionKey,
  initialPrompt = null,
}: {
  accountId: string;
  agentProfileId: string;
  sectionKey: CanvasSectionKey;
  /** Auto-sent once on arrival (e.g. a Gap Register brief) so the agent starts working immediately. */
  initialPrompt?: string | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const entry = AGENT_ROSTER[sectionKey];
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [runtimeOffline, setRuntimeOffline] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [threadPopoverOpen, setThreadPopoverOpen] = useState(false);
  const [decidingMessageId, setDecidingMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoSentRef = useRef(false);

  useEffect(() => () => clearTimeout(pollTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    setThreadsLoaded(false);
    (async () => {
      const { data } = await supabaseUntyped
        .from<ThreadRow>("workspace_threads")
        .select("id, title, created_at")
        .eq("account_id", accountId)
        .eq("agent_profile_id", agentProfileId)
        .eq("archived", false)
        .order("created_at", { ascending: true })
        .limit(30);
      if (cancelled) return;
      setThreads(data ?? []);
      setActiveThreadId((current) => current ?? data?.[0]?.id ?? null);
      setThreadsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, agentProfileId]);

  const loadMessages = useCallback(async (threadId: string) => {
    const { data } = await supabaseUntyped
      .from<MessageRow>("workspace_messages")
      .select("id, role, kind, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages(data ?? []);
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      setMessagesReady(false);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    setMessagesReady(false);
    void loadMessages(activeThreadId).finally(() => {
      if (!cancelled) {
        setLoadingMessages(false);
        setMessagesReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, awaitingReply]);

  const ensureThread = useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId;
    const { data, error } = await supabaseUntyped
      .from<ThreadRow>("workspace_threads")
      .insert({
        account_id: accountId,
        agent_profile_id: agentProfileId,
        title: "Open floor",
        created_by: user?.id ?? null,
      })
      .select("id, title, created_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create thread");
    setThreads((prev) => [...prev, data]);
    setActiveThreadId(data.id);
    return data.id;
  }, [accountId, agentProfileId, activeThreadId, user]);

  const pollRun = useCallback((runId: string, threadId: string, attempt: number) => {
    if (attempt >= RUN_POLL_MAX_ATTEMPTS) {
      setAwaitingReply(false);
      setChatError(
        `${entry.callsign} is taking longer than expected. The run continues in the background — check the Activity page or reload shortly.`,
      );
      return;
    }
    getAgentRuntime(accountId)
      .getRunStatus(runId)
      .then((status) => {
        if (!status || status.status === "pending" || status.status === "running") {
          pollTimer.current = setTimeout(() => pollRun(runId, threadId, attempt + 1), RUN_POLL_INTERVAL_MS);
          return;
        }
        setAwaitingReply(false);
        if (status.status === "completed") {
          void loadMessages(threadId);
        } else {
          setChatError(status.error ?? `Run ${status.status}. Send the message again to retry.`);
        }
      })
      .catch(() => {
        pollTimer.current = setTimeout(() => pollRun(runId, threadId, attempt + 1), RUN_POLL_INTERVAL_MS);
      });
  }, [accountId, entry.callsign, loadMessages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || awaitingReply) return;
    setSending(true);
    setChatError(null);
    setRuntimeOffline(false);
    try {
      const threadId = await ensureThread();
      const { error: messageError } = await supabaseUntyped.from("workspace_messages").insert({
        thread_id: threadId,
        role: "user",
        kind: "text",
        content: { text: trimmed },
      });
      if (messageError) throw new Error(messageError.message);
      setDraft("");
      await loadMessages(threadId);

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
      // The runtime being unreachable is the spec'd degraded state; the human
      // message (if written) stays in the durable thread either way.
      setRuntimeOffline(true);
      setChatError(error instanceof Error ? error.message : "Runtime unreachable");
    } finally {
      setSending(false);
    }
  }, [accountId, agentProfileId, awaitingReply, ensureThread, loadMessages, pollRun, sending, user]);

  // Gap Register arrivals: send the brief once, so the agent is already
  // working the problem when the user lands. Two hard conditions
  // (RF-LIVE-29): wait until the thread list AND its messages have actually
  // loaded — firing early made ensureThread create a duplicate thread on
  // every refresh, stranding finished answers in orphaned threads — and only
  // send into an EMPTY thread, since the ?gap= param survives remounts.
  useEffect(() => {
    if (!initialPrompt || autoSentRef.current || sending || awaitingReply) return;
    if (!threadsLoaded) return;
    if (activeThreadId && !messagesReady) return;
    autoSentRef.current = true;
    if (messages.length > 0) return;
    void sendMessage(initialPrompt);
  }, [initialPrompt, threadsLoaded, activeThreadId, messagesReady, sending, awaitingReply, messages.length, sendMessage]);

  const createThread = useCallback(async () => {
    const title = newThreadTitle.trim() || "New topic";
    const { data, error } = await supabaseUntyped
      .from<ThreadRow>("workspace_threads")
      .insert({
        account_id: accountId,
        agent_profile_id: agentProfileId,
        title,
        created_by: user?.id ?? null,
      })
      .select("id, title, created_at")
      .single();
    if (error || !data) {
      setChatError(error?.message ?? "Failed to create thread");
      return;
    }
    setThreads((prev) => [...prev, data]);
    setActiveThreadId(data.id);
    setNewThreadTitle("");
    setThreadPopoverOpen(false);
  }, [accountId, agentProfileId, newThreadTitle, user]);

  const ensureBusinessContext = useCallback(async (): Promise<string> => {
    const { data: existingContext } = await supabase
      .from("business_context_versions")
      .select("id")
      .eq("account_id", accountId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingContext?.id) return existingContext.id;

    const { data: created, error } = await supabase
      .from("business_context_versions")
      .insert({
        account_id: accountId,
        version_number: 1,
        summary: "Initial business context",
        data: {},
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Failed to create business context");
    return created.id;
  }, [accountId, user]);

  const recordProposalDecision = useCallback(async (
    message: MessageRow,
    decision: "approved" | "declined",
    extras: Record<string, unknown> = {},
  ) => {
    const { error } = await supabaseUntyped
      .from("workspace_messages")
      .update({
        content: {
          ...message.content,
          decision,
          decided_at: new Date().toISOString(),
          decided_by: user?.id ?? null,
          ...extras,
        },
      })
      .eq("id", message.id);
    if (error) throw new Error(error.message);
    if (activeThreadId) await loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages, user]);

  const approveProposal = useCallback(async (message: MessageRow) => {
    if (decidingMessageId) return;
    const proposalText =
      typeof message.content?.idea === "string"
        ? message.content.idea
        : typeof message.content?.text === "string"
          ? message.content.text
          : "";
    if (!proposalText.trim()) {
      toast({ title: "Proposal is empty", description: "There is nothing to approve yet.", variant: "destructive" });
      return;
    }
    setDecidingMessageId(message.id);
    try {
      const contextVersionId = await ensureBusinessContext();

      // A new version REPLACES the section for every reader (latest-per-section
      // semantics) — approving must append to the current items, never reduce
      // the section to the proposal alone. Same fallback order as the canvas:
      // latest version first, else the legacy analysis strings.
      const { data: latestVersion } = await supabase
        .from("canvas_section_versions")
        .select("items")
        .eq("account_id", accountId)
        .eq("section_key", sectionKey)
        .is("competitor_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let existingItems: unknown[] = Array.isArray(latestVersion?.items) ? latestVersion.items : [];
      if (existingItems.length === 0) {
        const legacy = getActiveAnalysisCanvas()?.[LEGACY_SECTION_KEYS[sectionKey]];
        if (Array.isArray(legacy)) {
          existingItems = legacy.filter((item) => typeof item === "string" && item.length > 0);
        }
      }
      const itemText = (item: unknown): string =>
        typeof item === "string"
          ? item
          : typeof (item as { text?: unknown })?.text === "string"
            ? ((item as { text: string }).text)
            : "";
      const newText = proposalText.trim();
      const alreadyPresent = existingItems.some(
        (item) => itemText(item).trim().toLowerCase() === newText.toLowerCase(),
      );
      const mergedItems = alreadyPresent ? existingItems : [...existingItems, newText];

      const { error: versionError } = await supabase.from("canvas_section_versions").insert({
        account_id: accountId,
        business_context_version_id: contextVersionId,
        competitor_id: null,
        section_key: sectionKey,
        section_title: CANVAS_SECTION_LABELS[sectionKey],
        items: mergedItems as unknown as Json,
        notes: "Approved from an agent workspace proposal.",
        confidence: typeof message.content?.confidence === "number" ? message.content.confidence : null,
        freshness_status: "fresh",
        last_verified_at: new Date().toISOString(),
        created_by_agent_profile_id: agentProfileId,
        created_by: user?.id ?? null,
      });
      if (versionError) throw versionError;
      await recordProposalDecision(message, "approved", { approved_section_key: sectionKey });
      toast({ title: "Proposal approved", description: `Added to ${CANVAS_SECTION_LABELS[sectionKey]}.` });
    } catch (error) {
      toast({
        title: "Could not approve proposal",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDecidingMessageId(null);
    }
  }, [accountId, agentProfileId, decidingMessageId, ensureBusinessContext, recordProposalDecision, sectionKey, toast, user]);

  const declineProposal = useCallback(async (message: MessageRow) => {
    if (decidingMessageId) return;
    setDecidingMessageId(message.id);
    try {
      await recordProposalDecision(message, "declined");
      toast({ title: "Proposal declined", description: "Decision recorded on the thread." });
    } catch (error) {
      toast({
        title: "Could not decline proposal",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDecidingMessageId(null);
    }
  }, [decidingMessageId, recordProposalDecision, toast]);

  const editProposal = useCallback((message: MessageRow) => {
    const proposalText =
      typeof message.content?.idea === "string"
        ? message.content.idea
        : typeof message.content?.text === "string"
          ? message.content.text
          : "";
    setDraft(`Revise this proposal for ${CANVAS_SECTION_LABELS[sectionKey]}:\n\n${proposalText}`);
  }, [sectionKey]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thread header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Popover open={threadPopoverOpen} onOpenChange={setThreadPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 font-semibold">
              {activeThread?.title ?? "Open floor"}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="space-y-0.5">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setActiveThreadId(thread.id);
                    setThreadPopoverOpen(false);
                  }}
                  className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    thread.id === activeThreadId ? "bg-muted font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  {thread.title ?? "Untitled thread"}
                </button>
              ))}
              {threads.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No threads yet — your first message opens “Open floor”.
                </p>
              )}
            </div>
            <form
              className="mt-2 flex gap-1.5 border-t border-border pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createThread();
              }}
            >
              <Input
                value={newThreadTitle}
                onChange={(event) => setNewThreadTitle(event.target.value)}
                placeholder="New thread topic…"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" variant="outline" className="h-8 gap-1 px-2">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Add
              </Button>
            </form>
          </PopoverContent>
        </Popover>
        <span className="text-[10px] text-muted-foreground">
          with {entry.callsign} · {CANVAS_SECTION_LABELS[sectionKey]}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loadingMessages ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 && !awaitingReply ? (
          <EmptyThread
            callsign={entry.callsign}
            sectionLabel={CANVAS_SECTION_LABELS[sectionKey]}
            sectionKey={sectionKey}
            onPick={(prompt) => setDraft(prompt)}
          />
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                sectionKey={sectionKey}
                deciding={decidingMessageId === message.id}
                onApprove={() => void approveProposal(message)}
                onDecline={() => void declineProposal(message)}
                onEdit={() => editProposal(message)}
              />
            ))}
            {awaitingReply && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {entry.callsign} is working on a reply — this can take a minute…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Errors / degraded banner */}
      {chatError && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {runtimeOffline && <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {runtimeOffline ? "Runtime unreachable — chat and runs are paused; canvas and history remain available. " : ""}
            {chatError}
          </span>
        </div>
      )}

      {/* Composer */}
      <form
        className="flex shrink-0 items-end gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage(draft);
            }
          }}
          placeholder={`Message ${entry.callsign}… (Enter to send, Shift+Enter for a new line)`}
          rows={2}
          className="min-h-[44px] resize-none text-sm"
        />
        <Button
          type="submit"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={sending || awaitingReply || !draft.trim()}
          aria-label="Send message"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}

function EmptyThread({
  callsign,
  sectionLabel,
  sectionKey,
  onPick,
}: {
  callsign: string;
  sectionLabel: string;
  sectionKey: CanvasSectionKey;
  onPick: (prompt: string) => void;
}) {
  const prompts = [...(SUGGESTED_PROMPTS[sectionKey] ?? []), MISSING_DATA_PROMPT];
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 text-center">
      <div>
        <p className="text-sm font-semibold">Talk to {callsign} about {sectionLabel}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {callsign} reads the section canvas and the evidence behind it, and proposes changes
          instead of making silent edits.
        </p>
      </div>
      <div className="w-full space-y-1.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="flex w-full items-start gap-2 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/35 hover:bg-muted/40"
          >
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageCard({
  message,
  sectionKey,
  deciding,
  onApprove,
  onDecline,
  onEdit,
}: {
  message: MessageRow;
  sectionKey: CanvasSectionKey;
  deciding: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onEdit: () => void;
}) {
  const entry = AGENT_ROSTER[sectionKey];
  const Icon = entry.icon;
  const text = typeof message.content?.text === "string" ? message.content.text : null;

  if (message.kind === "proposal") {
    const idea = typeof message.content?.idea === "string" ? message.content.idea : null;
    const competitor = typeof message.content?.competitor_name === "string" ? message.content.competitor_name : null;
    const decision = typeof message.content?.decision === "string" ? message.content.decision : null;
    return (
      <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Proposal{competitor ? ` · borrowed from ${competitor}` : ""}
          </p>
          {decision && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {decision}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed">{idea ?? text ?? "Proposal"}</p>
        {!decision && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-8 gap-1.5" disabled={deciding} onClick={onApprove}>
              {deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={deciding} onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" disabled={deciding} onClick={onDecline}>
              <XCircle className="h-3.5 w-3.5" />
              Decline
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (message.role === "agent") {
    return (
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${entry.avatarClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 max-w-[85%] rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-sm">
          <div className="prose prose-sm prose-slate max-w-none dark:prose-invert [&_p]:my-2.5 [&_p]:leading-relaxed [&_li]:my-1 [&_ul]:my-2 [&_ol]:my-2 [&_strong]:font-semibold [&_strong]:text-foreground [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text ?? ""}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
        {text ?? JSON.stringify(message.content)}
      </div>
    </div>
  );
}
