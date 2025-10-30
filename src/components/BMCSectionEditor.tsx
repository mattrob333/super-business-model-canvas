import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, RotateCcw, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const SECTION_QUICK_QUESTIONS: Record<string, string[]> = {
  "Key Partners": [
    "What strategic partners are we missing in our value chain?",
    "Which partnerships could accelerate our market expansion?"
  ],
  "Key Activities": [
    "What critical activities should we be focusing on to differentiate?",
    "Are there activities we could outsource to focus on core strengths?"
  ],
  "Key Resources": [
    "What unique resources give us competitive advantage?",
    "What resources do we need to acquire for our growth goals?"
  ],
  "Value Propositions": [
    "How can we better articulate our unique value to customers?",
    "What unmet customer needs could we address?"
  ],
  "Customer Relationships": [
    "How can we deepen engagement with our customer base?",
    "What relationship strategies do leading competitors use?"
  ],
  "Channels": [
    "Are there underutilized distribution channels we should explore?",
    "Which channels provide the best ROI for customer acquisition?"
  ],
  "Customer Segments": [
    "What adjacent customer segments should we target for expansion?",
    "Are there high-value segments we're currently overlooking?"
  ],
  "Cost Structure": [
    "Where can we optimize costs without compromising quality?",
    "What are the most significant cost drivers in our model?"
  ],
  "Revenue Streams": [
    "What new revenue streams could we develop from existing assets?",
    "How can we increase recurring revenue in our model?"
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setEditedItems(section.items);
    setNotes(section.notes || "");
    // Reset messages when section changes to show correct welcome message
    setMessages([
      {
        role: "assistant",
        content: `I'm your **Strategy Assistant** for ${companyName}'s **${section.title}**. I can help you:\n\n• Identify improvement opportunities and strategic goals\n• Suggest expansion targets and new segments/partners/channels\n• Analyze gaps between current state and industry leaders\n• Define measurable objectives for this section\n\nYour goals will be saved and used to guide all future framework analyses.`,
      },
    ]);
  }, [section, companyName]);


  useEffect(() => {
    // ScrollArea uses a [data-radix-scroll-area-viewport] internally
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const handleSave = () => {
    onSave({ items: editedItems, notes });
    toast({
      title: "Saved",
      description: `${section.title} updated successfully`,
    });
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bmc-chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
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

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      // Add placeholder for assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "" },
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
    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `I'm your **Strategy Assistant** for ${companyName}'s **${section.title}**. I can help you:\n\n• Identify improvement opportunities and strategic goals\n• Suggest expansion targets and new segments/partners/channels\n• Analyze gaps between current state and industry leaders\n• Define measurable objectives for this section\n\nYour goals will be saved and used to guide all future framework analyses.`,
      },
    ]);
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

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:max-w-[66vw] bg-[#0a0a0a] border-l border-white/[0.12] z-50 flex animate-in slide-in-from-right duration-300">
        {/* Mobile Tabs Layout */}
        <div className="flex-1 md:hidden flex flex-col">
          <Tabs defaultValue="edit" className="flex-1 flex flex-col">
            <div className="border-b border-white/[0.12] px-6 pt-6 pb-4 flex items-center justify-between">
              <TabsList className="bg-white/[0.05]">
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="chat">AI Chat</TabsTrigger>
              </TabsList>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="hover:bg-white/[0.1]"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <TabsContent value="edit" className="flex-1 flex flex-col mt-0">
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  {/* Bullet Points */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Content Items</label>
                      <Button onClick={addItem} size="sm" variant="outline" className="h-8">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {editedItems.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={item}
                          onChange={(e) => updateItem(index, e.target.value)}
                          className="flex-1 bg-white/[0.05] border-white/[0.12]"
                          placeholder={`Item ${index + 1}`}
                        />
                        <Button
                          onClick={() => removeItem(index)}
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Strategic Goals */}
                  <div className="space-y-2 pt-4">
                    <label className="text-sm font-medium">Strategic Goals & Improvement Targets</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Define where you want to go with this section. What improvements, expansions, or strategic shifts are you targeting?"
                      className="min-h-[150px] bg-white/[0.05] border-white/[0.12]"
                    />
                    <p className="text-xs text-muted-foreground">
                      * These goals will guide AI recommendations across all framework analyses. They won't appear on the main canvas but will shape strategic advice.
                    </p>
                  </div>
                </div>
              </ScrollArea>

              {/* Save Button */}
              <div className="border-t border-white/[0.12] p-6">
                <Button onClick={handleSave} className="w-full" size="lg">
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="chat" className="flex-1 flex flex-col mt-0">
              {/* Header */}
              <div className="border-b border-white/[0.12] p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="label-tech text-primary">AI Assistant</span>
                </div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Chat & Refine</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearChat}
                    className="hover:bg-white/[0.1]"
                    title="Clear chat"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Chat Area */}
                <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                  <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-6 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/[0.06] border border-white/[0.12]"
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
                        {/* Show loading dots only for last assistant message with no content */}
                        {isLoading && 
                         index === messages.length - 1 && 
                         message.role === "assistant" && 
                         !message.content && (
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

              {/* Quick Start Questions - Mobile */}
              {messages.length <= 1 && SECTION_QUICK_QUESTIONS[section.title] && (
                <div className="px-6 pb-3 space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">Quick Start:</p>
                  <div className="flex flex-wrap gap-2">
                    {SECTION_QUICK_QUESTIONS[section.title]?.map((question, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setInput(question);
                          handleSend(question);
                        }}
                        className="text-xs h-auto py-2 px-3 whitespace-normal text-left justify-start"
                        disabled={isLoading}
                      >
                        {question}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="border-t border-white/[0.12] p-6">
                <div className="flex gap-3">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask for suggestions or improvements..."
                    className="flex-1 bg-white/[0.05] border-white/[0.12] focus:border-primary"
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop Side-by-Side Layout */}
        {/* Left Panel - Edit Form */}
        <div className="hidden md:flex md:w-[55%] border-r border-white/[0.12] flex-col">
          {/* Header */}
          <div className="border-b border-white/[0.12] p-6 h-[88px] flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">Edit and refine your content</p>
            </div>
          </div>

          {/* Form Content */}
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-4">
              {/* Bullet Points */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Content Items</label>
                  <Button onClick={addItem} size="sm" variant="outline" className="h-8">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {editedItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                      className="flex-1 bg-white/[0.05] border-white/[0.12]"
                      placeholder={`Item ${index + 1}`}
                    />
                    <Button
                      onClick={() => removeItem(index)}
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Strategic Goals */}
              <div className="space-y-2 pt-4">
                <label className="text-sm font-medium">Strategic Goals & Improvement Targets</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Define where you want to go with this section. What improvements, expansions, or strategic shifts are you targeting?"
                  className="min-h-[150px] bg-white/[0.05] border-white/[0.12]"
                />
                <p className="text-xs text-muted-foreground">
                  * These goals will guide AI recommendations across all framework analyses. They won't appear on the main canvas but will shape strategic advice.
                </p>
              </div>
            </div>
          </ScrollArea>

          {/* Save Button */}
          <div className="border-t border-white/[0.12] p-6 h-[88px] flex items-center">
            <Button onClick={handleSave} className="w-full" size="lg">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>

        {/* Right Panel - AI Chat */}
        <div className="hidden md:flex md:w-[45%] flex-col">
          {/* Header */}
          <div className="border-b border-white/[0.12] p-6 h-[88px] flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="label-tech text-primary">AI Assistant</span>
              </div>
              <h3 className="text-lg font-semibold">Chat & Refine</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearChat}
                className="hover:bg-white/[0.1]"
                title="Clear chat"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="hover:bg-white/[0.1]"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Chat Area */}
              <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-6 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.06] border border-white/[0.12]"
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
                        {/* Show loading dots only for last assistant message with no content */}
                        {isLoading && 
                         index === messages.length - 1 && 
                         message.role === "assistant" && 
                         !message.content && (
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

          {/* Quick Start Questions - Desktop */}
          {messages.length <= 1 && SECTION_QUICK_QUESTIONS[section.title] && (
            <div className="px-6 pb-3 space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">Quick Start:</p>
              <div className="flex flex-wrap gap-2">
                {SECTION_QUICK_QUESTIONS[section.title]?.map((question, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInput(question);
                      handleSend(question);
                    }}
                    className="text-xs h-auto py-2 px-3 whitespace-normal text-left justify-start"
                    disabled={isLoading}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-white/[0.12] p-6 h-[88px] flex flex-col justify-center">
            <div className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask for suggestions or improvements..."
                className="flex-1 bg-white/[0.05] border-white/[0.12] focus:border-primary"
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
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
      </div>
    </>
  );
};
