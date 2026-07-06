import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import { FilePlus2, Link2, Loader2, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { supabaseUntyped } from "@/lib/supabase-untyped";

type ContextSourceType = "file" | "url" | "note";

interface ContextSource {
  id: string;
  account_id: string;
  agent_profile_id: string;
  type: ContextSourceType;
  name: string;
  uri: string | null;
  config: Json;
  enabled: boolean;
  created_at: string;
}

function sourceText(source: ContextSource): string {
  const config = source.config;
  if (config && typeof config === "object" && !Array.isArray(config) && "text" in config) {
    const text = config.text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

export function ContextSourcesPanel({
  accountId,
  agentProfileId,
}: {
  accountId: string;
  agentProfileId: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sources, setSources] = useState<ContextSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [noteName, setNoteName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [urlName, setUrlName] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseUntyped
      .from<ContextSource>("context_sources")
      .select("id, account_id, agent_profile_id, type, name, uri, config, enabled, created_at")
      .eq("account_id", accountId)
      .eq("agent_profile_id", agentProfileId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Context sources did not load", description: error.message, variant: "destructive" });
      setSources([]);
    } else {
      setSources((data ?? []) as ContextSource[]);
    }
    setLoading(false);
  }, [accountId, agentProfileId, toast]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const createSource = useCallback(async (input: {
    type: ContextSourceType;
    name: string;
    uri?: string | null;
    config?: Record<string, unknown>;
  }) => {
    const { data, error } = await supabaseUntyped
      .from<ContextSource>("context_sources")
      .insert({
        account_id: accountId,
        agent_profile_id: agentProfileId,
        type: input.type,
        name: input.name,
        uri: input.uri ?? null,
        config: input.config ?? {},
        enabled: true,
        created_by: user?.id ?? null,
      })
      .select("id, account_id, agent_profile_id, type, name, uri, config, enabled, created_at")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Context source insert matched zero rows.");
    setSources((current) => [data as ContextSource, ...current]);
  }, [accountId, agentProfileId, user]);

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setSaving("note");
    try {
      await createSource({
        type: "note",
        name: noteName.trim() || "Workspace note",
        config: { text: noteText.trim() },
      });
      setNoteName("");
      setNoteText("");
      setAddOpen(false);
      toast({ title: "Note added", description: "It will be available on the next workspace reply." });
    } catch (error) {
      toast({ title: "Note was not added", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }, [createSource, noteName, noteText, toast]);

  const handleAddUrl = useCallback(async () => {
    if (!urlValue.trim()) return;
    setSaving("url");
    try {
      await createSource({
        type: "url",
        name: urlName.trim() || urlValue.trim(),
        uri: urlValue.trim(),
      });
      setUrlName("");
      setUrlValue("");
      setAddOpen(false);
      toast({ title: "URL added", description: "The agent will see the URL label on the next reply." });
    } catch (error) {
      toast({ title: "URL was not added", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }, [createSource, toast, urlName, urlValue]);

  const handleFileUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSaving("file");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
      const path = `${accountId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("context-files")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      await createSource({
        type: "file",
        name: file.name,
        uri: `context-files://${path}`,
        config: {
          storage_bucket: "context-files",
          storage_path: path,
          content_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
        },
      });
      setAddOpen(false);
      toast({ title: "File added", description: "It is attached as a workspace context source." });
    } catch (error) {
      toast({ title: "File was not added", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }, [accountId, createSource, toast]);

  const updateEnabled = useCallback(async (source: ContextSource, enabled: boolean) => {
    setSaving(source.id);
    const { data, error } = await supabaseUntyped
      .from<{ id: string; enabled: boolean }>("context_sources")
      .update({ enabled })
      .eq("id", source.id)
      .eq("account_id", accountId)
      .select("id, enabled")
      .single();
    setSaving(null);
    if (error || !data) {
      toast({ title: "Context source was not updated", description: error?.message ?? "Update matched zero rows.", variant: "destructive" });
      return;
    }
    setSources((current) => current.map((item) => (item.id === source.id ? { ...item, enabled } : item)));
  }, [accountId, toast]);

  const deleteSource = useCallback(async (source: ContextSource) => {
    setSaving(source.id);
    const { error } = await supabaseUntyped
      .from("context_sources")
      .delete()
      .eq("id", source.id)
      .eq("account_id", accountId);
    if (!error && source.type === "file" && source.uri?.startsWith("context-files://")) {
      const path = source.uri.replace("context-files://", "");
      await supabase.storage.from("context-files").remove([path]);
    }
    setSaving(null);
    if (error) {
      toast({ title: "Context source was not deleted", description: error.message, variant: "destructive" });
      return;
    }
    const { data: stillThere, error: verifyError } = await supabaseUntyped
      .from<{ id: string }>("context_sources")
      .select("id")
      .eq("id", source.id)
      .eq("account_id", accountId)
      .maybeSingle();
    if (verifyError || stillThere) {
      toast({ title: "Context source was not deleted", description: verifyError?.message ?? "Delete matched zero rows.", variant: "destructive" });
      return;
    }
    setSources((current) => current.filter((item) => item.id !== source.id));
  }, [accountId, toast]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Context sources
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Used on the next workspace reply.</p>
        </div>
      </div>

      {/* One clean entry point (NotebookLM pattern, owner directive
          2026-07-06) — the note/URL forms live behind it instead of
          wallpapering the rail. Added sources stack in the list below. */}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="mt-3 h-8 w-full gap-1.5">
            <FilePlus2 className="h-3.5 w-3.5" />
            Add source
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-4 p-4">
          <Button asChild size="sm" variant="outline" className="h-8 w-full gap-1.5" disabled={saving !== null}>
            <label className="cursor-pointer">
              {saving === "file" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
              Upload a file
              <input
                type="file"
                className="sr-only"
                onChange={(event) => void handleFileUpload(event)}
                disabled={saving !== null}
              />
            </label>
          </Button>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex gap-2">
              <Input
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://..."
                className="h-8 text-xs"
                disabled={saving !== null}
              />
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => void handleAddUrl()} disabled={!urlValue.trim() || saving !== null}>
                {saving === "url" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <Input
              value={urlName}
              onChange={(event) => setUrlName(event.target.value)}
              placeholder="URL label (optional)"
              className="h-8 text-xs"
              disabled={saving !== null}
            />
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <Input
              value={noteName}
              onChange={(event) => setNoteName(event.target.value)}
              placeholder="Note title (optional)"
              className="h-8 text-xs"
              disabled={saving !== null}
            />
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Add a note for this agent"
              className="min-h-16 text-xs"
              disabled={saving !== null}
            />
            <Button size="sm" className="h-8 w-full gap-1.5" onClick={() => void handleAddNote()} disabled={!noteText.trim() || saving !== null}>
              {saving === "note" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <NotebookPen className="h-3.5 w-3.5" />}
              Add note
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
        <p className="text-sm font-semibold leading-snug">Company Brief</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Pinned account brief. Always available to workspace agents.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {sources.map((source) => (
            <li key={source.id} className="rounded-md border border-border/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-snug">{source.name}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{source.type}</p>
                  {source.type === "note" && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{sourceText(source)}</p>
                  )}
                  {source.type === "url" && source.uri && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{source.uri}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => void updateEnabled(source, checked)}
                    disabled={saving !== null}
                    aria-label={`${source.enabled ? "Disable" : "Enable"} ${source.name}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => void deleteSource(source)}
                    disabled={saving !== null}
                    aria-label={`Delete ${source.name}`}
                  >
                    {saving === source.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No extra sources yet.
        </p>
      )}
    </section>
  );
}
