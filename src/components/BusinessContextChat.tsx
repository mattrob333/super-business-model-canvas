import { useState, useEffect, useRef } from "react";
import { X, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface BusinessContextChatProps {
  chatState: 'closed' | 'minimized' | 'open';
  onStateChange: (state: 'closed' | 'minimized' | 'open') => void;
  selectedAnalysis: any;
  initialPrompt: string;
  userId: string;
  initialResearchMode?: boolean;
}

export const BusinessContextChat = ({
  chatState,
  onStateChange,
  selectedAnalysis,
  initialPrompt,
  userId,
  initialResearchMode = false,
}: BusinessContextChatProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useResearchMode, setUseResearchMode] = useState(initialResearchMode);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-pro");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Sync research mode with initial prop when drawer opens
  useEffect(() => {
    if (chatState === 'open') {
      setUseResearchMode(initialResearchMode);
    }
  }, [chatState, initialResearchMode]);

  // Send initial prompt when chat opens
  useEffect(() => {
    if (chatState === 'open' && initialPrompt && messages.length === 0) {
      handleSendMessage(initialPrompt);
    }
  }, [chatState, initialPrompt]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session. Please log in again.");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strategy-coach-chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            companyId: selectedAnalysis.id,
            userMessage: textToSend,
            useResearchMode,
            selectedModel,
            conversationHistory: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      // Get session ID from response header
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && !sessionId) {
        setSessionId(newSessionId);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      // Add placeholder for assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: new Date().toISOString() },
      ]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                // Update the last message with accumulated content
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantMessage,
                    timestamp: new Date().toISOString(),
                  };
                  return updated;
                });
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
              console.debug("Parse error:", e);
            }
          }
        }
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      
      if (error.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }

      toast({
        title: "Error",
        description: error.message || "Failed to send message. Please try again.",
        variant: "destructive",
      });

      // Remove the placeholder assistant message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setSessionId(null);
    toast({
      title: "Chat cleared",
      description: "Starting a fresh conversation",
    });
  };

  const handleMinimize = () => {
    // Cancel any ongoing request when minimizing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onStateChange('minimized');
  };

  if (chatState === 'closed') return null;

  // Show floating button when minimized
  if (chatState === 'minimized') {
    return (
      <div className="fixed right-6 bottom-6 z-40">
        <button
          onClick={() => onStateChange('open')}
          className="group bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-2xl hover:shadow-primary/20 transition-all duration-300 hover:scale-105 p-4 flex flex-col gap-2 min-w-[160px]"
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <Sparkles className="h-5 w-5" />
              {messages.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {messages.length}
                </span>
              )}
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-xs font-semibold">Strategy Coach</span>
              <span className="text-[10px] opacity-80">{selectedAnalysis.company_name}</span>
            </div>
          </div>
          {isLoading && (
            <div className="flex gap-1 justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse [animation-delay:0.2s]" />
              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse [animation-delay:0.4s]" />
            </div>
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={handleMinimize}
      />

      {/* Chat Drawer */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[720px] bg-background border-l border-gray-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Strategy Coach</h3>
              <p className="text-sm text-muted-foreground">
                {selectedAnalysis.company_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleMinimize}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                <p className="text-lg font-medium mb-2">
                  Ready to discuss strategy
                </p>
                <p className="text-sm">
                  I've reviewed {selectedAnalysis.company_name}'s business context.
                  <br />
                  What would you like to explore?
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.role === "assistant" && (
                    <Badge variant="outline" className="mb-2 text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Coach
                    </Badge>
                  )}
                  <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_p]:mb-4 [&_ul]:mb-4 [&_ol]:mb-4 [&_h1]:mb-4 [&_h2]:mb-4 [&_h3]:mb-4">
                    {message.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                  {isLoading && index === messages.length - 1 && message.role === "assistant" && !message.content && (
                    <div className="flex gap-1 mt-2">
                      <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse" />
                      <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse [animation-delay:0.2s]" />
                      <div className="h-2 w-2 rounded-full bg-primary/60 animate-pulse [animation-delay:0.4s]" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-800 bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Select
              value={selectedModel}
              onValueChange={(value) => {
                setSelectedModel(value);
                setUseResearchMode(value === "perplexity");
              }}
              disabled={isLoading}
            >
              <SelectTrigger className="w-[180px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-pro" className="text-xs">Gemini Pro 2.5</SelectItem>
                <SelectItem value="gemini-flash" className="text-xs">Gemini Flash</SelectItem>
                <SelectItem value="perplexity" className="text-xs">Perplexity</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {selectedAnalysis.company_name}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={() => handleSendMessage()}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};