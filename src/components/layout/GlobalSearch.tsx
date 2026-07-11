import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Building2,
  Database,
  FileText,
  Globe2,
  Grid3X3,
  LayoutDashboard,
  Search,
  Settings,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { supabaseUntyped } from "@/lib/supabase-untyped";
import { useAccountId } from "@/hooks/useAccountId";
import { useAuth } from "@/hooks/useAuth";
import { setActiveAnalysis } from "@/lib/active-analysis";
import { setActiveWorkspaceName } from "@/lib/active-workspace";
import { loadCompanyScope } from "@/lib/company-scope";
import { AGENT_ROSTER } from "@/lib/agent-roster";
import { CANVAS_SECTION_KEYS, CANVAS_SECTION_LABELS } from "@/components/canvas/section-types";

/**
 * The TopBar search, made real (owner question 2026-07-06: "is it even
 * connected?" — it wasn't). A command palette over the things you actually
 * jump between: saved companies, the nine agent rooms, pages, and the active
 * company's documents. Opens on click or Cmd/Ctrl+K.
 */

interface CompanyEntry {
  id: string;
  company_name: string;
}

interface ArtifactEntry {
  id: string;
  title: string;
}

const PAGES = [
  { label: "War Room", icon: Globe2, path: "/war-room" },
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Canvas", icon: Grid3X3, path: "/canvas" },
  { label: "Gap Register", icon: AlertTriangle, path: "/gaps" },
  { label: "Agents", icon: Bot, path: "/agents" },
  { label: "Knowledge", icon: Database, path: "/knowledge" },
  { label: "Playbooks", icon: BookOpen, path: "/playbooks" },
  { label: "Activity", icon: Activity, path: "/activity" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { accountId } = useAccountId();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyEntry[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Dynamic entries load when the palette opens — a closed palette costs nothing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (user) {
        const { data } = await supabase
          .from("saved_analyses")
          .select("id, company_name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!cancelled && data) setCompanies(data as CompanyEntry[]);
      }
      if (accountId) {
        const scope = await loadCompanyScope(accountId).catch(() => null);
        let query = supabaseUntyped
          .from<ArtifactEntry & { business_context_version_id: string | null }>("skill_artifacts")
          .select("id, title")
          .eq("account_id", accountId);
        if (scope) query = query.in("business_context_version_id", scope.contextIds);
        const { data } = await query.order("created_at", { ascending: false }).limit(10);
        if (!cancelled && data) setArtifacts(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, accountId]);

  const go = useCallback((path: string) => {
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const openCompany = useCallback(async (entry: CompanyEntry) => {
    setOpen(false);
    // Same open flow as My Analyses: pointer + workspace name, then /canvas
    // (the canvas page's company-sync effect switches the agents over).
    const { data } = await supabase
      .from("saved_analyses")
      .select("id, company_name, analysis_data")
      .eq("id", entry.id)
      .maybeSingle();
    if (!data) return;
    setActiveWorkspaceName(data.company_name);
    try {
      sessionStorage.setItem("loadedAnalysis", JSON.stringify(data.analysis_data));
    } catch {
      // sessionStorage is best-effort; the active-analysis pointer below is the source of truth.
    }
    setActiveAnalysis({ id: data.id, data: data.analysis_data as Record<string, unknown> });
    navigate("/canvas");
  }, [navigate]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">Search companies, rooms, documents...</span>
        <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a company, agent room, page, or document..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {companies.length > 0 && (
            <CommandGroup heading="Saved companies">
              {companies.map((entry) => (
                <CommandItem key={entry.id} value={`company ${entry.company_name}`} onSelect={() => void openCompany(entry)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  {entry.company_name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Agent rooms">
            {CANVAS_SECTION_KEYS.map((sectionKey) => {
              const agent = AGENT_ROSTER[sectionKey];
              const label = CANVAS_SECTION_LABELS[sectionKey];
              return (
                <CommandItem
                  key={sectionKey}
                  value={`room ${agent.callsign} ${label}`}
                  onSelect={() => go(`/workspace/${sectionKey}`)}
                >
                  <agent.icon className="mr-2 h-4 w-4" />
                  {label}
                  <span className="ml-2 text-xs text-muted-foreground">{agent.role}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Pages">
            {PAGES.map((page) => (
              <CommandItem key={page.path} value={`page ${page.label}`} onSelect={() => go(page.path)}>
                <page.icon className="mr-2 h-4 w-4" />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
          {artifacts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Documents">
                {artifacts.map((artifact) => (
                  <CommandItem key={artifact.id} value={`document ${artifact.title}`} onSelect={() => go(`/artifacts/${artifact.id}`)}>
                    <FileText className="mr-2 h-4 w-4" />
                    <span className="min-w-0 truncate">{artifact.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
