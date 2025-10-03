import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

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
      const { supabase } = await import("@/integrations/supabase/client");
      
      const functionName = mode === 'competitor' ? 'competitor-chat' : 'bmc-chat';
      const body = mode === 'competitor' 
        ? {
            messages: [...messages, userMessage],
            competitor,
            companyName,
            businessContext
          }
        : {
            section: section?.title,
            sectionContent: Array.isArray(section?.items) ? section.items.join(', ') : section?.items,
            userMessage: userInput,
            conversationHistory: messages,
            companyName: companyName,
            businessContext: businessContext
          };

      const { data, error } = await supabase.functions.invoke(functionName, {
        body
      });

      if (error) throw error;

      const aiMessage: Message = {
        role: "assistant",
        content: data.response
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again."
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
      <div className="fixed right-0 top-0 h-full w-full max-w-[500px] bg-[#0a0a0a] border-l border-white/[0.12] z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="border-b border-white/[0.12] p-6 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="label-tech text-primary">AI Analysis</span>
            </div>
            <h2 className="text-xl font-semibold">
              {mode === 'competitor' && competitor ? competitor.name : section?.title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="hover:bg-white/[0.1]"
          >
            <X className="h-5 w-5" />
          </Button>
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
                  className={`max-w-[85%] rounded-2xl p-4 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/[0.06] border border-white/[0.12]"
                  }`}
                >
                  <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-white/[0.12] p-6">
          <div className="flex gap-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about this section..."
              className="flex-1 bg-white/[0.05] border-white/[0.12] focus:border-primary"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
};
