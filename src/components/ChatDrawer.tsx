import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface CanvasSection {
  title: string;
  items: string[];
}

interface Competitor {
  name: string;
  description: string;
  website: string;
}

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section?: CanvasSection | null;
  competitor?: Competitor | null;
  companyName: string;
  businessContext?: any;
  mode?: 'bmc' | 'competitor';
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const ChatDrawer = ({ 
  open, 
  onOpenChange, 
  section,
  competitor,
  companyName, 
  businessContext,
  mode = 'bmc'
}: ChatDrawerProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      if (mode === 'competitor' && competitor) {
        setMessages([
          {
            role: "assistant",
            content: `I'm here to help you analyze **${competitor.name}** as a competitor to ${companyName}. You can ask me to:\n\n• Explain their market positioning\n• Analyze their strengths and weaknesses\n• Compare them to ${companyName}\n• Identify strategic opportunities`,
          },
        ]);
      } else if (mode === 'bmc' && section) {
        setMessages([
          {
            role: "assistant",
            content: `I can help you analyze ${companyName}'s ${section.title}. You can ask me to:\n\n• Summarize their approach\n• Suggest improvements\n• Compare to competitors\n• Identify opportunities`,
          },
        ]);
      }
    }
  }, [open, section, competitor, companyName, mode]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (mode === 'bmc' && !section) return;
    if (mode === 'competitor' && !competitor) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");

    try {
      if (mode === 'competitor') {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data, error } = await supabase.functions.invoke('competitor-chat', {
          body: {
            messages: [...messages, userMessage],
            competitor,
            companyName,
            businessContext
          }
        });

        if (error) throw error;

        const aiMessage: Message = {
          role: "assistant",
          content: data.response
        };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        // bmc-chat streams SSE — consume it incrementally like BMCSectionEditor
        const { getAccessToken, readGrokSseStream } = await import("@/lib/supabase-auth");
        const accessToken = await getAccessToken();

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bmc-chat`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              section: section?.title,
              sectionContent: Array.isArray(section?.items) ? section.items.join(', ') : section?.items,
              userMessage: userInput,
              conversationHistory: messages,
              companyName: companyName,
              businessContext: businessContext
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
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      };
      setMessages((prev) => {
        // Drop an empty streaming placeholder left behind by a failed stream
        const hasEmptyPlaceholder =
          prev.length > 0 &&
          prev[prev.length - 1].role === "assistant" &&
          !prev[prev.length - 1].content;
        const base = hasEmptyPlaceholder ? prev.slice(0, -1) : prev;
        return [...base, errorMessage];
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    // Re-initialize with welcome message
    if (mode === 'competitor' && competitor) {
      setMessages([
        {
          role: "assistant",
          content: `I'm here to help you analyze **${competitor.name}** as a similar company to ${companyName}. You can ask me to:\n\n• Explain their market positioning\n• Analyze their strengths and weaknesses\n• Compare them to ${companyName}\n• Identify strategic opportunities`,
        },
      ]);
    } else if (mode === 'bmc' && section) {
      setMessages([
        {
          role: "assistant",
          content: `I can help you analyze ${companyName}'s ${section.title}. You can ask me to:\n\n• Summarize their approach\n• Suggest improvements\n• Compare to similar companies\n• Identify opportunities`,
        },
      ]);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:max-w-[500px] bg-card border-l border-border z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="border-b border-border p-6 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">AI Analysis</span>
            </div>
            <h2 className="text-xl font-semibold">
              {mode === 'competitor' && competitor ? competitor.name : section?.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearChat}
              className="hover:bg-muted"
              title="Clear chat"
              aria-label="Clear chat history"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="hover:bg-muted"
              aria-label="Close chat drawer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <ScrollArea className="flex-1 p-6">
          <div ref={scrollRef} className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-6 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted border border-border"
                  }`}
                >
                  <div className={
                    message.role === "assistant"
                      ? "prose prose-invert max-w-none [&>p]:mb-5 [&>p]:leading-relaxed [&>ul]:space-y-2 [&>ol]:space-y-2 [&>ul]:mb-5 [&>ol]:mb-5 [&>h1]:mt-6 [&>h1]:mb-3 [&>h1]:font-semibold [&>h2]:mt-6 [&>h2]:mb-3 [&>h2]:font-semibold [&>h3]:mt-5 [&>h3]:mb-2 [&>h3]:font-semibold [&>li]:leading-relaxed [&>strong]:font-semibold [&>hr]:my-6"
                      : "prose prose-invert max-w-none [&>p]:mb-0"
                  }>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ node, ...props }) => (
                            <div className="my-6 w-full overflow-x-auto">
                              <Table {...props} />
                            </div>
                          ),
                          thead: ({ node, ...props }) => <TableHeader {...props} />,
                          tbody: ({ node, ...props }) => <TableBody {...props} />,
                          tr: ({ node, ...props }) => <TableRow {...props} />,
                          th: ({ node, ...props }) => (
                            <TableHead {...props} />
                          ),
                          td: ({ node, ...props }) => (
                            <TableCell {...props} />
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-6 border-t border-border">
          <div className="rounded-2xl bg-muted/40 border border-border p-4">
            <div className="flex items-center gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about this section..."
                className="flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 h-9 w-9 rounded-xl bg-background hover:bg-primary/20 transition-all duration-200 group"
              >
                <Send className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
