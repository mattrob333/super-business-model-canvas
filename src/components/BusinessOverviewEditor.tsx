import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, RotateCcw, Plus, Trash2, Save, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";

interface KeyExecutive {
  name: string;
  role: string;
}

interface BusinessOverviewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    name: string;
    industry: string;
    description: string;
    website: string;
    keyExecutives: KeyExecutive[];
    productsServices: string[];
    notes?: string;
  };
  onSave: (updatedData: BusinessOverviewEditorProps['data']) => void;
  companyName: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const BusinessOverviewEditor = ({ 
  open, 
  onOpenChange, 
  data,
  onSave,
  companyName
}: BusinessOverviewEditorProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [editedData, setEditedData] = useState(data);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setEditedData(data);
  }, [data]);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: `I can help you refine your company description or do research to make it better. You can ask me to:\n\n• Improve your company description\n• Research industry trends\n• Suggest better positioning\n• Refine your value proposition`,
        },
      ]);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSave = () => {
    onSave(editedData);
    toast({
      title: "Saved",
      description: "Business overview updated successfully",
    });
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput("");

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      const { data: responseData, error } = await supabase.functions.invoke('business-overview-chat', {
        body: {
          userMessage: userInput,
          conversationHistory: messages,
          companyName: companyName,
          overviewData: editedData
        }
      });

      if (error) throw error;

      const aiMessage: Message = {
        role: "assistant",
        content: responseData.response
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

  const handleClearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `I can help you refine your company description or do research to make it better. You can ask me to:\n\n• Improve your company description\n• Research industry trends\n• Suggest better positioning\n• Refine your value proposition`,
      },
    ]);
  };

  const addProductService = () => {
    setEditedData({
      ...editedData,
      productsServices: [...editedData.productsServices, ""]
    });
  };

  const removeProductService = (index: number) => {
    setEditedData({
      ...editedData,
      productsServices: editedData.productsServices.filter((_, i) => i !== index)
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
      keyExecutives: [...editedData.keyExecutives, { name: "", role: "" }]
    });
  };

  const removeExecutive = (index: number) => {
    setEditedData({
      ...editedData,
      keyExecutives: editedData.keyExecutives.filter((_, i) => i !== index)
    });
  };

  const updateExecutive = (index: number, field: 'name' | 'role', value: string) => {
    const updated = [...editedData.keyExecutives];
    updated[index][field] = value;
    setEditedData({ ...editedData, keyExecutives: updated });
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
                <div className="space-y-6">
                  {/* Company Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company Name</label>
                    <Input
                      value={editedData.name}
                      onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                      className="bg-white/[0.05] border-white/[0.12]"
                      placeholder="Company name"
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={editedData.description}
                      onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                      className="min-h-[100px] bg-white/[0.05] border-white/[0.12]"
                      placeholder="Company description..."
                    />
                  </div>

                  {/* Industry */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Industry</label>
                    <Input
                      value={editedData.industry}
                      onChange={(e) => setEditedData({ ...editedData, industry: e.target.value })}
                      className="bg-white/[0.05] border-white/[0.12]"
                      placeholder="Industry"
                    />
                  </div>

                  {/* Website */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Website</label>
                    <Input
                      value={editedData.website}
                      onChange={(e) => setEditedData({ ...editedData, website: e.target.value })}
                      className="bg-white/[0.05] border-white/[0.12]"
                      placeholder="https://..."
                    />
                  </div>

                  {/* Key Executives */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Key Leadership</label>
                      <Button onClick={addExecutive} size="sm" variant="outline" className="h-8">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {editedData.keyExecutives.map((exec, index) => (
                      <div key={index} className="space-y-2 p-3 bg-white/[0.03] rounded-lg border border-white/[0.08]">
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 text-primary mt-2" />
                          <div className="flex-1 space-y-2">
                            <Input
                              value={exec.name}
                              onChange={(e) => updateExecutive(index, 'name', e.target.value)}
                              className="bg-white/[0.05] border-white/[0.12]"
                              placeholder="Name"
                            />
                            <Input
                              value={exec.role}
                              onChange={(e) => updateExecutive(index, 'role', e.target.value)}
                              className="bg-white/[0.05] border-white/[0.12]"
                              placeholder="Role"
                            />
                          </div>
                          <Button
                            onClick={() => removeExecutive(index)}
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Products & Services */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Products & Services</label>
                      <Button onClick={addProductService} size="sm" variant="outline" className="h-8">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {editedData.productsServices.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={item}
                          onChange={(e) => updateProductService(index, e.target.value)}
                          className="flex-1 bg-white/[0.05] border-white/[0.12]"
                          placeholder={`Product/Service ${index + 1}`}
                        />
                        <Button
                          onClick={() => removeProductService(index)}
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Notes Field */}
                  <div className="space-y-2 pt-4 border-t border-white/[0.08]">
                    <label className="text-sm font-medium">Additional Notes</label>
                    <Textarea
                      value={editedData.notes || ""}
                      onChange={(e) => setEditedData({ ...editedData, notes: e.target.value })}
                      placeholder="Add context or details for AI chat (not visible on main page)"
                      className="min-h-[150px] bg-white/[0.05] border-white/[0.12]"
                    />
                    <p className="text-xs text-muted-foreground">
                      These notes will be included in AI chat context but won't appear on the main page
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
                    placeholder="Ask for suggestions or improvements..."
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
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop Side-by-Side Layout */}
        {/* Left Panel - Edit Form */}
        <div className="hidden md:flex md:w-[55%] border-r border-white/[0.12] flex-col">
          {/* Header */}
          <div className="border-b border-white/[0.12] p-6">
            <h2 className="text-xl font-semibold">Business Overview</h2>
            <p className="text-sm text-muted-foreground mt-1">Edit your company information</p>
          </div>

          {/* Form Content */}
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {/* Company Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name</label>
                <Input
                  value={editedData.name}
                  onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                  className="bg-white/[0.05] border-white/[0.12]"
                  placeholder="Company name"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editedData.description}
                  onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                  className="min-h-[100px] bg-white/[0.05] border-white/[0.12]"
                  placeholder="Company description..."
                />
              </div>

              {/* Industry */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Industry</label>
                <Input
                  value={editedData.industry}
                  onChange={(e) => setEditedData({ ...editedData, industry: e.target.value })}
                  className="bg-white/[0.05] border-white/[0.12]"
                  placeholder="Industry"
                />
              </div>

              {/* Website */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Website</label>
                <Input
                  value={editedData.website}
                  onChange={(e) => setEditedData({ ...editedData, website: e.target.value })}
                  className="bg-white/[0.05] border-white/[0.12]"
                  placeholder="https://..."
                />
              </div>

              {/* Key Executives */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Key Leadership</label>
                  <Button onClick={addExecutive} size="sm" variant="outline" className="h-8">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {editedData.keyExecutives.map((exec, index) => (
                  <div key={index} className="space-y-2 p-3 bg-white/[0.03] rounded-lg border border-white/[0.08]">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-primary mt-2" />
                      <div className="flex-1 space-y-2">
                        <Input
                          value={exec.name}
                          onChange={(e) => updateExecutive(index, 'name', e.target.value)}
                          className="bg-white/[0.05] border-white/[0.12]"
                          placeholder="Name"
                        />
                        <Input
                          value={exec.role}
                          onChange={(e) => updateExecutive(index, 'role', e.target.value)}
                          className="bg-white/[0.05] border-white/[0.12]"
                          placeholder="Role"
                        />
                      </div>
                      <Button
                        onClick={() => removeExecutive(index)}
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Products & Services */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Products & Services</label>
                  <Button onClick={addProductService} size="sm" variant="outline" className="h-8">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                {editedData.productsServices.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) => updateProductService(index, e.target.value)}
                      className="flex-1 bg-white/[0.05] border-white/[0.12]"
                      placeholder={`Product/Service ${index + 1}`}
                    />
                    <Button
                      onClick={() => removeProductService(index)}
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Notes Field */}
              <div className="space-y-2 pt-4 border-t border-white/[0.08]">
                <label className="text-sm font-medium">Additional Notes</label>
                <Textarea
                  value={editedData.notes || ""}
                  onChange={(e) => setEditedData({ ...editedData, notes: e.target.value })}
                  placeholder="Add context or details for AI chat (not visible on main page)"
                  className="min-h-[150px] bg-white/[0.05] border-white/[0.12]"
                />
                <p className="text-xs text-muted-foreground">
                  These notes will be included in AI chat context but won't appear on the main page
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
        </div>

        {/* Right Panel - AI Chat */}
        <div className="hidden md:flex md:w-[45%] flex-col">
          {/* Header */}
          <div className="border-b border-white/[0.12] p-6 flex items-center justify-between">
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
                placeholder="Ask for suggestions or improvements..."
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
      </div>
    </>
  );
};
