import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FocusDrawer } from "@/components/overlay/FocusDrawer";
import { useToast } from "@/hooks/use-toast";
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
  "Cost Structure": "Detail your major expenses. Break down fixed costs, variable costs, and key cost drivers.",
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
  businessContext?: unknown;
  onSave: (updatedSection: { items: string[]; notes: string }) => void;
}

export const BMCSectionEditor = ({
  open,
  onOpenChange,
  section,
  companyName,
  onSave,
}: BMCSectionEditorProps) => {
  const [editedItems, setEditedItems] = useState<string[]>(section.items);
  const [notes, setNotes] = useState(section.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setEditedItems(section.items);
    setNotes(section.notes || "");
  }, [section, companyName]);

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
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {workspaceEntry && (
          <Link
            to={`/workspace/${workspaceEntry.sectionKey}`}
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/35"
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
            className="min-h-[150px] focus:border-primary/50 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:hover:bg-muted-foreground/30"
          />
        </div>
      </div>
    </FocusDrawer>
  );
};
