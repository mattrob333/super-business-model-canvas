import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getAccessToken, readGrokSseStream } from "@/lib/supabase-auth";

interface KeyExecutive {
  name: string;
  role: string;
}

export interface BusinessOverviewData {
  name: string;
  industry: string;
  description: string;
  productsServices: string[];
  keyExecutives: KeyExecutive[];
  website: string;
  notes?: string;
}

interface CompanyProfileDrawerProps {
  data: BusinessOverviewData;
  onUpdate?: (data: BusinessOverviewData) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content: `I can help you refine your company description or do research to make it better. You can ask me to:\n\n• Improve your company description\n• Research industry trends\n• Suggest better positioning\n• Refine your value proposition`,
};

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

/**
 * Company profile on the standard FocusDrawer (spec 09): subtle trigger,
 * view ↔ edit modes swapped inside ONE drawer, AI rail for chat and refine.
 * Replaces the stacked BusinessOverviewSheet + BusinessOverviewEditor pair.
 */
export function CompanyProfileDrawer({ data, onUpdate }: CompanyProfileDrawerProps) {
  const [open, setOpen] = useState(false);
  // Inline expansion under the company header (owner directive 2026-07-07):
  // the subtle link toggles the overview card in place; the drawer stays the
  // home of editing and the AI assistant.
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editedData, setEditedData] = useState(data);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { session } = useAuth();

  useEffect(() => {
    setEditedData(data);
  }, [data]);

  useEffect(() => {
    if (open) {
      setMode("view");
      setMessages((prev) => (prev.length === 0 ? [WELCOME_MESSAGE] : prev));
    }
  }, [open]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const handleSave = () => {
    onUpdate?.(editedData);
    toast({
      title: "Saved",
      description: "Business overview updated successfully",
    });
    setMode("view");
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");
    setIsLoading(true);

    try {
      const accessToken = await getAccessToken(session);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/business-overview-chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userMessage: userInput,
            conversationHistory: messages,
            companyName: data.name,
            overviewData: editedData,
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
    } catch (error) {
      console.error("Chat error:", error);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([WELCOME_MESSAGE]);
  };

  const addProductService = () => {
    setEditedData({
      ...editedData,
      productsServices: [...editedData.productsServices, ""],
    });
  };

  const removeProductService = (index: number) => {
    setEditedData({
      ...editedData,
      productsServices: editedData.productsServices.filter((_, i) => i !== index),
    });
  };

  const updateProductService = (index: number, value: string) => {
    const updated = [...editedData.productsServices];
    updated[index] = value;
    setEditedData({ ...editedData, productsServices: updated });
  };

  const addExecutive = () => {
    setEditedData({
      ...editedData,
      keyExecutives: [...editedData.keyExecutives, { name: "", role: "" }],
    });
  };

  const removeExecutive = (index: number) => {
    setEditedData({
      ...editedData,
      keyExecutives: editedData.keyExecutives.filter((_, i) => i !== index),
    });
  };

  const updateExecutive = (index: number, field: "name" | "role", value: string) => {
    const updated = [...editedData.keyExecutives];
    updated[index] = { ...updated[index], [field]: value };
    setEditedData({ ...editedData, keyExecutives: updated });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>Business overview</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 rounded-lg border border-border bg-muted/20 p-4 text-left animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/90">{data.description}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.productsServices.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Products &amp; services
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-foreground/85">
                  {data.productsServices.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.keyExecutives.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Key executives
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-foreground/85">
                  {data.keyExecutives.map((executive) => (
                    <li key={`${executive.name}:${executive.role}`}>
                      <span className="font-medium">{executive.name}</span>
                      <span className="text-muted-foreground"> — {executive.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/70 pt-3">
            {data.website && (
              <a
                href={data.website.startsWith("http") ? data.website : `https://${data.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {data.website}
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setOpen(true)}
            >
              <Pencil className="h-3 w-3" />
              Edit &amp; refine with AI
            </Button>
          </div>
        </div>
      )}

      <FocusDrawer
        open={open}
        onOpenChange={setOpen}
        size="focus"
        eyebrow="Business overview"
        title={data.name}
        subtitle={data.industry}
        headerActions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
          >
            {mode === "view" ? (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Done
              </>
            )}
          </Button>
        }
        footer={
          mode === "edit" ? (
            <Button onClick={handleSave} className="w-full gap-2" size="lg">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          ) : undefined
        }
        rail={{
          mobileLabel: "Assistant",
          header: (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    AI Assistant
                  </span>
                </div>
                <h3 className="text-sm font-semibold">Chat &amp; Refine</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                className="h-8 w-8 shrink-0 hover:bg-muted"
                title="Clear chat"
                aria-label="Clear chat"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          ),
          content: (
            <ScrollArea ref={scrollRef} className="h-full">
              <div className="space-y-4 px-4 py-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-lg p-4 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-muted"
                      }`}
                    >
                      <div
                        className={
                          message.role === "assistant"
                            ? "text-sm max-w-none [&>p]:mb-5 [&>p]:leading-relaxed [&>ul]:space-y-2 [&>ol]:space-y-2 [&>ul]:mb-5 [&>ol]:mb-5 [&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:font-semibold [&>h2]:mt-6 [&>h2]:mb-3 [&>h2]:font-semibold [&>h3]:mt-5 [&>h3]:mb-2 [&>h3]:font-semibold [&>li]:leading-relaxed [&>strong]:font-semibold [&>hr]:my-6 [&>*:last-child]:mb-0"
                            : "text-sm max-w-none [&>p]:mb-0"
                        }
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ),
          footer: (
            <div>
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask for suggestions or improvements..."
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="shrink-0"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Press Enter to send</p>
            </div>
          ),
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {mode === "view" ? (
            <div className="space-y-6">
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  About
                </h3>
                <p className="text-sm leading-relaxed text-foreground/90">{data.description}</p>
              </section>

              {data.website && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Website
                  </h3>
                  <a
                    href={data.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    {data.website.replace(/^https?:\/\/(www\.)?/, "")}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </section>
              )}

              {data.productsServices.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Products &amp; services
                  </h3>
                  <ul className="space-y-2">
                    {data.productsServices.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.keyExecutives.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Key leadership
                  </h3>
                  <ul className="space-y-3">
                    {data.keyExecutives.map((exec, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{exec.name}</p>
                          <p className="text-xs text-muted-foreground">{exec.role}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="flex items-center gap-2 border-t border-border pt-4">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  AI-drafted. Review and refine for accuracy.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name</label>
                <Input
                  value={editedData.name}
                  onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                  placeholder="Company name"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editedData.description}
                  onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                  className="min-h-[100px]"
                  placeholder="Company description..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Industry</label>
                <Input
                  value={editedData.industry}
                  onChange={(e) => setEditedData({ ...editedData, industry: e.target.value })}
                  placeholder="Industry"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Website</label>
                <Input
                  value={editedData.website}
                  onChange={(e) => setEditedData({ ...editedData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Key Leadership</label>
                  <Button onClick={addExecutive} size="sm" variant="outline" className="h-8">
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {editedData.keyExecutives.map((exec, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <div className="flex items-start gap-2">
                      <User className="mt-2 h-4 w-4 text-primary" />
                      <div className="flex-1 space-y-2">
                        <Input
                          value={exec.name}
                          onChange={(e) => updateExecutive(index, "name", e.target.value)}
                          placeholder="Name"
                        />
                        <Input
                          value={exec.role}
                          onChange={(e) => updateExecutive(index, "role", e.target.value)}
                          placeholder="Role"
                        />
                      </div>
                      <Button
                        onClick={() => removeExecutive(index)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Remove executive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Products &amp; Services</label>
                  <Button onClick={addProductService} size="sm" variant="outline" className="h-8">
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {editedData.productsServices.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) => updateProductService(index, e.target.value)}
                      className="flex-1"
                      placeholder={`Product/Service ${index + 1}`}
                    />
                    <Button
                      onClick={() => removeProductService(index)}
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                      aria-label="Remove product or service"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <label className="text-sm font-medium">Additional Notes</label>
                <Textarea
                  value={editedData.notes || ""}
                  onChange={(e) => setEditedData({ ...editedData, notes: e.target.value })}
                  placeholder="Add context or details for AI chat (not visible on main page)"
                  className="min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground">
                  These notes will be included in AI chat context but won't appear on the main page
                </p>
              </div>
            </div>
          )}
        </div>
      </FocusDrawer>
    </>
  );
}
