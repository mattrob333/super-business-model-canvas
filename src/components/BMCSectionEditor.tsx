import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      size="reading"
      eyebrow="Canvas section"
      title={section.title}
      subtitle={SECTION_DESCRIPTIONS[section.title]}
      footer={
        <Button onClick={handleSave} className="w-full font-medium" disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Changes"}
        </Button>
      }
    >
      {/* A quick-edit form, not a document: the reading-width panel and a
          full-width column replace the old 72vw drawer whose centered content
          left dead margins on both sides (owner finding 2026-07-06). */}
      <div className="space-y-6 px-5 py-5 sm:px-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Items on the canvas</label>
            <Button
              onClick={addItem}
              size="sm"
              variant="ghost"
              className="h-8 border border-primary/30 hover:border-primary hover:bg-transparent"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add item
            </Button>
          </div>
          <div className="space-y-2">
            {editedItems.map((item, index) => (
              <div key={index} className="flex gap-2">
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
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {editedItems.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No items yet — add one above, or let {workspaceEntry?.callsign ?? "the agent"} research this section.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <label className="text-sm font-semibold">Strategic goals</label>
            <span className="text-[11px] text-muted-foreground">Private — steers every AI recommendation</span>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Expand into healthcare by Q2, targeting $500K ARR from 5 enterprise clients…"
            className="min-h-[120px] focus:border-primary/50"
          />
        </div>

        {workspaceEntry && (
          <Link
            to={`/workspace/${workspaceEntry.sectionKey}`}
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:border-primary/35"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${workspaceEntry.avatarClass}`}>
                <workspaceEntry.icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 text-xs text-muted-foreground">
                Need research or evidence?{" "}
                <span className="font-semibold text-foreground">Open {workspaceEntry.callsign}&rsquo;s workspace</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          </Link>
        )}
      </div>
    </FocusDrawer>
  );
};
