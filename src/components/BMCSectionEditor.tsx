import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send, Sparkles, RotateCcw, Plus, Trash2, Save, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getAccessToken, readGrokSseStream } from "@/lib/supabase-auth";
import { CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";
import { AGENT_ROSTER } from "@/lib/agent-roster";

const SECTION_DESCRIPTIONS: Record<string, string> = {
  "Value Propositions": "Define why customers choose your business. Update or add new statements that describe what makes your offer unique.",
  "Customer Segments": "Identify the specific groups you serve. Refine who your ideal customers are and what defines each segment.",
  "Customer Relationships": "Describe how you interact with customers. Define engagement strategies and relationship-building approaches.",
  "Channels": "Map how you reach and deliver to customers. Add distribution channels, touchpoints, and delivery methods.",
  "Revenue Streams": "Outline how you generate income. Define pricing models, revenue sources, and monetization strategies.",
  "Key Resources": "List critical assets powering your business. Add intellectual property, infrastructure, people, and capital resources.",
  "Key Activities": "Define essential operations for success. Include core processes, production activities, and critical tasks.",
  "Key Partners": "Identify strategic alliances and suppliers. List partners who help you create and deliver value.",
  "Cost Structure": "Detail your major expenses. Break down fixed costs, variable costs, and key cost drivers."
};

const SECTION_QUICK_QUESTIONS: Record<string, string[]> = {
  "Key Partners": [
    "Identify strategic partners we're missing in our value chain",
    "Which partnerships could accelerate our market expansion?"
  ],
  "Key Activities": [
    "What critical activities should we focus on to differentiate?",
    "Identify activities we could outsource to focus on core strengths"
  ],
  "Key Resources": [
    "What unique resources give us competitive advantage?",
    "What resources do we need to acquire for our growth goals?"
  ],
  "Value Propositions": [
    "Refine our value propositions for clarity and differentiation",
    "Identify new customer needs or market opportunities"
  ],
  "Customer Relationships": [
    "Explore strategies to deepen engagement with our customer base",
    "Analyze relationship strategies used by leading competitors"
  ],
  "Channels": [
    "Explore underutilized distribution channels",
    "Analyze which channels provide the best ROI"
  ],
  "Customer Segments": [
    "Identify adjacent customer segments we should target for expansion",
    "Identify high-value segments we're currently overlooking"
  ],
  "Cost Structure": [
    "Identify opportunities to optimize costs without compromising quality",
    "Analyze the most significant cost drivers in our model"
  ],
  "Revenue Streams": [
    "Explore new revenue streams we could develop from existing assets",
    "Identify strategies to increase recurring revenue in our model"
  ]
};

interface BMCSectionEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: {
    title: string;
    items: string[];
    notes?: string;
  };
  companyName: string;
  businessContext?: any;
  onSave: (updatedSection: { items: string[]; notes: string }) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const buildWelcomeMessage = (sectionTitle: string): Message => ({
  role: "assistant",
  content: `**Strategy Assistant: ${sectionTitle}**\n\n*AI guidance for this section of your Context File.*\n\n• **Identify improvement opportunities and strategic goals**\n• Suggest expansion targets and new segments/partners/channels\n• Analyze gaps between current state and industry leaders\n• Define measurable objectives for this section\n\nYour goals will be saved and used to guide all future framework analyses.`,
});

const markdownComponents = {
  table: ({ node, ...props }) => (
    <div className="my-6 w-full overflow-x-auto">
      <Table {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <TableHeader {...props} />,
  tbody: ({ node, ...props }) => <TableBody {...props} />,
  tr: ({ node, ...props }) => <TableRow {...props} />,
  th: ({ node, ...props }) => <TableHead {...props} />,
  td: ({ node, ...props }) => <TableCell {...props} />,
} satisfies React.ComponentProps<typeof ReactMarkdown>["components"];

export const BMCSectionEditor = ({
  open,
  onOpenChange,
  section,
  companyName,
  businessContext,
  onSave
}: BMCSectionEditorProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editedItems, setEditedItems] = useState<string[]>(section.items);
  const [notes, setNotes] = useState(section.notes || "");
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { session } = useAuth();

  const generateGoalsPrompt = `Based on our current ${section.title} content and strategic context, generate 3-5 SMART strategic goals in clean bullet-point format. Use this exact structure:

• **[Goal Category]**: [Specific, measurable objective with clear metrics and timeline]

Make them specific, measurable, achievable, relevant, and time-bound. No additional commentary - just the bullet points I can copy and paste directly into my Strategic Goals field.`;

  useEffect(() => {
    setEditedItems(section.items);
    setNotes(section.notes || "");
    // Reset messages when section changes to show the correct welcome message
    setMessages([buildWelcomeMessage(section.title)]);
  }, [section, companyName]);

  useEffect(() => {
    // ScrollArea renders a [data-radix-scroll-area-viewport] that owns the scroll
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const handleSave = () => {
    setIsSaving(true);
    setSaveSuccess(false);

    setTimeout(() => {
      onSave({ items: editedItems, notes });
      setIsSaving(false);
      setSaveSuccess(true);

      toast({
        title: "Saved",
        description: `${section.title} updated successfully`,
      });

      setTimeout(() => setSaveSuccess(false), 2000);
    }, 300);
  };

  const handleSend = async (messageText?: string) => {
    const messageToSend = messageText || input.trim();
    if (!messageToSend || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: messageToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const accessToken = await getAccessToken(session);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bmc-chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            section: section.title,
            sectionContent: editedItems.join(", "),
            sectionNotes: notes,
            userMessage: messageToSend,
            conversationHistory: messages.map(m => ({
              role: m.role,
              content: m.content
            })),
            companyName,
            businessContext,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get response");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let assistantMessage = "";
      await readGrokSseStream(response, (content) => {
        assistantMessage += content;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantMessage,
          };
          return updated;
        });
      });

      if (!assistantMessage.trim()) {
        throw new Error("The assistant returned an empty response. Please try again.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const description =
        error instanceof Error ? error.message : "Failed to send message. Please try again.";
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
      setMessages((prev) => {
        const withoutEmptyPlaceholder =
          prev.length > 0 &&
          prev[prev.length - 1].role === "assistant" &&
          !prev[prev.length - 1].content
            ? prev.slice(0, -1)
            : prev;
        return [
          ...withoutEmptyPlaceholder,
          {
            role: "assistant",
            content: "Sorry, I encountered an error. Please try again.",
          },
        ];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([buildWelcomeMessage(section.title)]);
  };

  const handleCopyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      toast({
        title: "Copied to clipboard",
        description: "Paste this into your Strategic Goals field",
      });
      setTimeout(() => setCopiedMessageIndex(null), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please try selecting and copying manually",
        variant: "destructive",
      });
    }
  };

  const addItem = () => {
    setEditedItems([...editedItems, ""]);
  };

  const removeItem = (index: number) => {
    setEditedItems(editedItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, value: string) => {
    const updated = [...editedItems];
    updated[index] = value;
    setEditedItems(updated);
  };

  const quickQuestions = SECTION_QUICK_QUESTIONS[section.title];

  // The editor receives the section label; resolve it back to the canvas key
  // to link the matching agent room (spec 02 two-tier entry).
  const workspaceSectionKey = (Object.entries(CANVAS_SECTION_LABELS)
    .find(([, label]) => label === section.title)?.[0] ?? null) as keyof typeof AGENT_ROSTER | null;
  const workspaceEntry = workspaceSectionKey
    ? { sectionKey: workspaceSectionKey, ...AGENT_ROSTER[workspaceSectionKey] }
    : null;

  return (
    <FocusDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="focus"
      eyebrow="Canvas section"
      title={section.title}
      subtitle={SECTION_DESCRIPTIONS[section.title]}
      footer={
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <p className="text-xs text-muted-foreground">All changes save to your Context File.</p>
          <Button onClick={handleSave} className="w-full font-medium" disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Changes"}
          </Button>
        </div>
      }
      rail={{
        mobileLabel: "Assistant",
        header: (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Strategy Assistant</h3>
              <p className="truncate text-xs text-muted-foreground">
                AI guidance for this section of your Context File.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="h-8 w-8 shrink-0 hover:bg-muted"
              title="Clear chat"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        ),
        content: (
          <div className="flex h-full min-h-0 flex-col">
            <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
              <div className="space-y-4 p-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`relative max-w-[85%] rounded-2xl p-4 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted"
                      }`}
                    >
                      <div className={
                        message.role === "assistant"
                          ? "prose prose-invert max-w-none [&>p]:mb-5 [&>p]:leading-relaxed [&>ul]:space-y-2 [&>ol]:space-y-2 [&>ul]:mb-5 [&>ol]:mb-5 [&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:font-semibold [&>h2]:mt-6 [&>h2]:mb-3 [&>h2]:font-semibold [&>h3]:mt-5 [&>h3]:mb-2 [&>h3]:font-semibold [&>li]:leading-relaxed [&>strong]:font-semibold [&>hr]:my-6"
                          : "prose prose-invert max-w-none [&>p]:mb-0"
                      }>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>

                      {/* Loading dots for the streaming assistant message */}
                      {isLoading &&
                       index === messages.length - 1 &&
                       message.role === "assistant" &&
                       !message.content && (
                        <div className="mt-2 flex gap-1">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
                          <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.2s]" />
                          <div className="h-2 w-2 animate-pulse rounded-full bg-primary/60 [animation-delay:0.4s]" />
                        </div>
                      )}

                      {message.role === "assistant" && message.content && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyMessage(message.content, index)}
                          className="absolute bottom-2 right-2 h-8 w-8 hover:bg-muted"
                          aria-label="Copy message"
                        >
                          {copiedMessageIndex === index ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {quickQuestions && (
              <div className="shrink-0 space-y-2 border-t border-border px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">Quick start</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickQuestions.map((question, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInput(question);
                        handleSend(question);
                      }}
                      className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs leading-tight"
                      disabled={isLoading}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSend(generateGoalsPrompt)}
                        className="w-full border-primary/50 font-medium text-primary hover:border-primary hover:bg-primary/10"
                        disabled={isLoading}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate Strategic Goals
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>AI will propose measurable objectives based on your current statements and company context</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        ),
        footer: (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask anything about refining this section, e.g. 'Make this sound more outcome-focused.'"
                className="flex-1"
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Press Enter to send</p>
          </div>
        ),
      }}
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {/* Spec 02 entry point: quick edits stay here; deep work moves to the
            agent's full-screen room. */}
        {workspaceEntry && (
          <Link
            to={`/workspace/${workspaceEntry.sectionKey}`}
            onClick={() => onOpenChange(false)}
            className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/35`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${workspaceEntry.avatarClass}`}>
                <workspaceEntry.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  Open {workspaceEntry.callsign}&rsquo;s workspace
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Persistent threads, evidence-cited answers, the real {workspaceEntry.callsign} agent
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          </Link>
        )}

        {/* Content items */}
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Current {section.title}</p>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Content Items</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={addItem}
                    size="sm"
                    variant="ghost"
                    className="h-8 border border-primary/30 hover:border-primary hover:bg-transparent"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Add another {section.title.toLowerCase()} item</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {editedItems.map((item, index) => (
            <div key={index} className="flex gap-2 border-b border-border pb-3 last:border-0">
              <Input
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                className="flex-1"
                placeholder={`Item ${index + 1}`}
              />
              <Button
                onClick={() => removeItem(index)}
                size="icon"
                variant="ghost"
                className="h-10 w-10"
                aria-label={`Remove item ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Strategic goals and improvement targets */}
        <div className="space-y-3 rounded-r-lg border-l-[3px] border-primary bg-primary/5 py-4 pl-4 pr-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-semibold">Strategic Goals & Improvement Targets</label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-help items-center rounded-full border border-primary/30 bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
                        IMPORTANT
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>These goals stay private but influence all AI recommendations</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <p>
                  Set measurable goals. The AI uses them to personalize future strategy recommendations.
                </p>
                <p className="text-[11px] italic text-muted-foreground/80">
                  Example: Expand into healthcare by Q2 2025, targeting $500K ARR from 5 enterprise clients.
                </p>
              </div>
            </div>
          </div>

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Set specific, measurable goals with clear timelines..."
            className="min-h-[150px] focus:border-primary/50 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-muted-foreground/30"
          />
        </div>
      </div>
    </FocusDrawer>
  );
};
