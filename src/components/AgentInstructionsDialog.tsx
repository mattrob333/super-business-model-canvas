import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AgentProfile = Database["public"]["Tables"]["agent_profiles"]["Row"];

interface AgentInstructionsDialogProps {
  agent: AgentProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Dialog for viewing and editing an agent's system instructions.
 *
 * The system_instructions field contains the full prompt that the edge function
 * uses when executing agent runs. This is separate from system_instructions_summary,
 * which is a short description shown in the agent list.
 */
export function AgentInstructionsDialog({
  agent,
  open,
  onOpenChange,
  onSaved,
}: AgentInstructionsDialogProps) {
  const { toast } = useToast();
  const [instructions, setInstructions] = useState("");
  const [originalInstructions, setOriginalInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadInstructions = useCallback(async () => {
    if (!agent) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agent_profiles")
        .select("system_instructions")
        .eq("id", agent.id)
        .maybeSingle();

      if (error) throw error;

      const text = (data as { system_instructions: string | null } | null)?.system_instructions ?? "";
      setInstructions(text);
      setOriginalInstructions(text);
    } catch (err) {
      toast({
        title: "Failed to load instructions",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [agent, toast]);

  useEffect(() => {
    if (open && agent) {
      void loadInstructions();
    }
  }, [open, agent, loadInstructions]);

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("agent_profiles")
        .update({ system_instructions: instructions })
        .eq("id", agent.id);

      if (error) throw error;

      setOriginalInstructions(instructions);
      toast({
        title: "Instructions saved",
        description: "The updated system prompt will be used on the next agent run.",
      });
      onSaved?.();
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setInstructions(originalInstructions);
    toast({
      title: "Reverted to saved version",
      description: "Click Save to persist the reverted text.",
    });
  };

  const hasChanges = instructions !== originalInstructions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Agent Instructions
            {agent && (
              <Badge variant="secondary" className="text-xs">
                {agent.display_name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            The full system prompt used by the edge function when this agent
            executes analysis runs. Changes apply to new runs only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[400px] font-mono text-xs resize-none"
              placeholder="Enter the agent's system instructions here..."
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground">
            {instructions.length} characters
            {hasChanges && (
              <span className="ml-2 text-warning">• Unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || saving}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Revert
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saving || loading}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Instructions
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
