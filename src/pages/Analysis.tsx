import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UrlInput } from "@/components/UrlInput";
import { CompanyProfileDrawer } from "@/components/CompanyProfileDrawer";
import { EnterpriseBusinessModelCanvas } from "@/components/canvas/EnterpriseBusinessModelCanvas";
import type { CanvasSectionKey } from "@/components/canvas/section-types";
import { CompetitiveLandscape } from "@/components/CompetitiveLandscape";
import { ChatDrawer } from "@/components/ChatDrawer";
import { AtlasDock } from "@/components/atlas/AtlasDock";
import { ProcessSteps } from "@/components/ProcessSteps";
import { SuccessBanner } from "@/components/SuccessBanner";
import { FloatingCTA } from "@/components/FloatingCTA";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAccountId } from "@/hooks/useAccountId";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { clearActiveWorkspaceName, setActiveWorkspaceName } from "@/lib/active-workspace";
import {
  clearActiveAnalysis,
  getActiveAnalysis,
  setActiveAnalysis,
} from "@/lib/active-analysis";
import { bridgeAnalysisToCanvasVersions } from "@/lib/canvas-version-bridge";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, Search, ChevronUp, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Card as UICard, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo_2.png";

function syncWorkspaceFromAnalysis(data: { company?: { name?: string } } | null) {
  const name = data?.company?.name?.trim();
  if (name) {
    setActiveWorkspaceName(name);
  }
}

function persistActiveAnalysis(
  data: Record<string, unknown> | null,
  id?: string | null,
) {
  if (!data) return;
  syncWorkspaceFromAnalysis(data);
  setActiveAnalysis({
    id: id ?? getActiveAnalysis()?.id ?? null,
    data,
  });
}

function domainLabelFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "");
    const base = hostname.split(".")[0] ?? hostname;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return url;
  }
}

const Analysis = () => {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { accountId } = useAccountId();
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [isNewAnalysis, setIsNewAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [similarCompanyChatOpen, setSimilarCompanyChatOpen] = useState(false);
  const [selectedSimilarCompany, setSelectedSimilarCompany] = useState<any>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<any[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [scrollPercentage, setScrollPercentage] = useState(0);
  const [reviewedSections, setReviewedSections] = useState(0);
  const [showPlaybooksCTA, setShowPlaybooksCTA] = useState(false);
  const [bmcEditorOpen, setBmcEditorOpen] = useState(false);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [analyzingLabel, setAnalyzingLabel] = useState<string | undefined>();
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const saveAnalysisRecord = useCallback(async (
    nextAnalysisData: Record<string, unknown>,
    options?: { bridge?: boolean; summaryPrefix?: string },
  ): Promise<string | null> => {
    if (!user) return null;
    const companyRecord =
      nextAnalysisData.company &&
      typeof nextAnalysisData.company === "object" &&
      !Array.isArray(nextAnalysisData.company)
        ? nextAnalysisData.company as Record<string, unknown>
        : {};
    const rawName = companyRecord.name;
    const companyName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Unknown Company";

    const { data: existing } = await supabase
      .from("saved_analyses")
      .select("id")
      .eq("user_id", user.id)
      .eq("company_name", companyName)
      .maybeSingle();

    let savedId: string;
    if (existing?.id) {
      const { data, error } = await supabase
        .from("saved_analyses")
        .update({ analysis_data: nextAnalysisData as Json })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Saved analysis update matched zero rows.");
      savedId = data.id;
    } else {
      const { data, error } = await supabase
        .from("saved_analyses")
        .insert({
          user_id: user.id,
          company_name: companyName,
          analysis_data: nextAnalysisData as Json,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Saved analysis insert matched zero rows.");
      savedId = data.id;
    }

    if (options?.bridge && accountId) {
      await bridgeAnalysisToCanvasVersions({
        accountId,
        userId: user.id,
        sourceAnalysisId: savedId,
        analysisData: nextAnalysisData,
        summaryPrefix: options.summaryPrefix,
      });
    }

    return savedId;
  }, [accountId, user]);

  // Scroll tracking for CTA display
  useEffect(() => {
    if (!hasAnalyzed || !analysisData) return;
    
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const percentage = (scrollTop / (documentHeight - windowHeight)) * 100;
      setScrollPercentage(percentage);
      
      // Show CTA after 70% scroll or 30 seconds on page
      if (percentage > 70) {
        setShowPlaybooksCTA(true);
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // Also show CTA after 30 seconds
    const timer = setTimeout(() => {
      setShowPlaybooksCTA(true);
    }, 30000);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [hasAnalyzed, analysisData]);

  // Keep session in sync whenever results are on screen (survives sidebar navigation)
  useEffect(() => {
    if (hasAnalyzed && analysisData) {
      persistActiveAnalysis(analysisData);
    }
  }, [hasAnalyzed, analysisData]);

  // Load saved analysis from sessionStorage if available
  useEffect(() => {
    const loadedAnalysis = sessionStorage.getItem("loadedAnalysis");
    if (loadedAnalysis) {
      try {
        const parsed = JSON.parse(loadedAnalysis);
        setAnalysisData(parsed);
        setHasAnalyzed(true);
        setIsNewAnalysis(false);
        setSearchCollapsed(true);
        persistActiveAnalysis(parsed);
        sessionStorage.removeItem("loadedAnalysis");
        window.scrollTo({ top: 0, behavior: "auto" });
      } catch (error) {
        console.error("Failed to load analysis:", error);
      }
    } else {
      const active = getActiveAnalysis();
      if (active?.data) {
        setAnalysisData(active.data);
        setHasAnalyzed(true);
        setIsNewAnalysis(false);
        setSearchCollapsed(true);
        syncWorkspaceFromAnalysis(active.data);
      }
    }

    // Fetch recent analyses if user is logged in
    if (user) {
      supabase
        .from('saved_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3)
        .then(({ data }) => {
          if (data) setRecentAnalyses(data);
        });
    }
  }, [user]);

  const handleAnalyze = async (url: string) => {
    setIsLoading(true);
    setAnalyzingLabel(domainLabelFromUrl(url));
    setHasAnalyzed(false);
    setReviewedSections(0);
    setShowPlaybooksCTA(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { url }
      });

      if (error) throw error;

      if (data) {
        setAnalysisData(data);
        persistActiveAnalysis(data);
        setHasAnalyzed(true);
        setIsNewAnalysis(true);
        setSearchCollapsed(true);
        toast({
          title: "Analysis Complete",
          description: "Business model canvas generated successfully",
        });
        
        // Land at the top: company header + full canvas are the payoff
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 300);
      }
    } catch (error: any) {
      console.error('Analysis error:', error);

      // supabase.functions.invoke wraps any non-2xx response in a generic
      // "Edge Function returned a non-2xx status code" message and stashes the
      // real response on error.context. Dig it out so the user (and we) can see
      // the actual reason the AI backend failed (e.g. missing API key, auth).
      let description = "Failed to analyze company. Please try again.";
      try {
        const ctx = error?.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.clone().json().catch(() => null);
          description =
            body?.error || body?.details || error?.message || description;
        } else if (error?.message) {
          description = error.message;
        }
      } catch {
        if (error?.message) description = error.message;
      }

      toast({
        title: "Analysis Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setAnalyzingLabel(undefined);
    }
  };

  const handleBusinessOverviewUpdate = async (updatedData: any) => {
    const newAnalysisData = {
      ...analysisData,
      company: updatedData
    };
    
    setAnalysisData(newAnalysisData);
    persistActiveAnalysis(newAnalysisData);
    
    // Mark section as reviewed
    setReviewedSections(prev => prev + 1);
    
    // Auto-save if user is logged in
    if (user) {
      try {
        const savedId = await saveAnalysisRecord(newAnalysisData, {
          bridge: true,
          summaryPrefix: "Business overview update",
        });
        persistActiveAnalysis(newAnalysisData, savedId);
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    }
  };

  // Auto-save on initial analysis completion
  useEffect(() => {
    if (hasAnalyzed && analysisData && user && isNewAnalysis) {
      const autoSave = async () => {
        try {
          const savedId = await saveAnalysisRecord(analysisData, {
            bridge: true,
            summaryPrefix: "URL analysis",
          });
          persistActiveAnalysis(analysisData, savedId);
        } catch (error) {
          console.error('Initial auto-save error:', error);
        }
      };
      autoSave();
    }
  }, [hasAnalyzed, analysisData, user, isNewAnalysis, saveAnalysisRecord]);

  const handleBMCSectionUpdate = (sectionKey: CanvasSectionKey, updatedData: { items: string[]; notes: string }) => {
    const legacyKeyMap: Record<CanvasSectionKey, string> = {
      key_partners: "keyPartners",
      key_activities: "keyActivities",
      key_resources: "keyResources",
      value_propositions: "valuePropositions",
      customer_relationships: "customerRelationships",
      channels: "channels",
      customer_segments: "customerSegments",
      cost_structure: "costStructure",
      revenue_streams: "revenueStreams",
    };

    const legacyKey = legacyKeyMap[sectionKey];
    if (!legacyKey) return;

    const sectionTitleMap: Record<CanvasSectionKey, string> = {
      key_partners: "Key Partners",
      key_activities: "Key Activities",
      key_resources: "Key Resources",
      value_propositions: "Value Propositions",
      customer_relationships: "Customer Relationships",
      channels: "Channels",
      customer_segments: "Customer Segments",
      cost_structure: "Cost Structure",
      revenue_streams: "Revenue Streams",
    };
    const sectionTitle = sectionTitleMap[sectionKey];

    // Track unique reviewed sections
    setReviewedSections((prev) => Math.min(prev + 1, 11));

    const updatedCanvas = {
      ...analysisData.canvas,
      [legacyKey]: updatedData.items,
      [`${legacyKey}_notes`]: updatedData.notes,
    };

    const nextAnalysisData = {
      ...analysisData,
      canvas: updatedCanvas,
    };

    setAnalysisData(nextAnalysisData);
    persistActiveAnalysis(nextAnalysisData);

    // Auto-save if user is logged in
    if (user && analysisData) {
      void saveAnalysisRecord(nextAnalysisData, {
        bridge: true,
        summaryPrefix: "Canvas section update",
      })
        .then((savedId) => {
          persistActiveAnalysis(nextAnalysisData, savedId);
          toast({
            title: "Saved",
            description: `${sectionTitle} updated and saved`,
          });
        })
        .catch((error) => {
          toast({
            title: "Save failed",
            description: error instanceof Error ? error.message : "Changes are kept locally only.",
            variant: "destructive",
          });
        });
    } else {
      toast({
        title: "Updated",
        description: `${sectionTitle} updated successfully`,
      });
    }
  };

  const saveAnalysis = async () => {
    if (!user) {
      toast({
        title: "Sign up to save",
        description: "Create an account to save your analyses",
      });
      navigate("/auth");
      return;
    }

    if (!analysisData) return;

    setIsSaving(true);
    try {
      const savedId = await saveAnalysisRecord(analysisData, {
        bridge: true,
        summaryPrefix: "Manual save",
      });
      persistActiveAnalysis(analysisData, savedId);

      toast({
        title: "Saved!",
        description: "Analysis saved to your account and synced to the agent canvas.",
      });

      // Refresh recent analyses list
      const { data } = await supabase
        .from("saved_analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (data) setRecentAnalyses(data);
    } catch (error: any) {
      console.error("Save error:", error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save analysis",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNavigateToPlaybooks = async () => {
    // Save analysis first if user is logged in
    if (user && analysisData) {
      try {
        const savedId = await saveAnalysisRecord(analysisData, {
          bridge: true,
          summaryPrefix: "Playbooks handoff",
        });
        persistActiveAnalysis(analysisData, savedId);
      } catch (error) {
        console.error("Failed to save before navigation:", error);
        // Continue to navigate even if save fails
      }
    }

    // Store analysis in sessionStorage for Playbooks page to pick up
    sessionStorage.setItem("playbookContext", JSON.stringify({
      companyName: analysisData?.company?.name || "Unknown Company",
      businessContext: analysisData,
    }));

    // Navigate to Playbooks
    navigate("/playbooks");
  };

  const copyToMarkdown = () => {
    if (!analysisData) return;

    const markdown = `# Business Analysis: ${analysisData.company?.name || 'Unknown Company'}

## Business Overview
- **Industry:** ${analysisData.company?.industry || 'N/A'}
- **Website:** ${analysisData.company?.website || 'N/A'}
- **Description:** ${analysisData.company?.description || 'N/A'}

### Products & Services
${analysisData.company?.productsServices?.map((p: string) => `- ${p}`).join('\n') || '- N/A'}

### Key Leadership
${analysisData.company?.keyExecutives?.map((e: any) => `- ${e.name} - ${e.role}`).join('\n') || '- N/A'}
${analysisData.company?.notes ? `\n**Additional Notes:**\n${analysisData.company.notes}\n` : ''}

## Business Model Canvas

### Key Partners
${analysisData.canvas?.keyPartners?.map((p: string) => `- ${p}`).join('\n') || '- N/A'}
${analysisData.canvas?.keyPartners_notes ? `\n**Additional Notes:**\n${analysisData.canvas.keyPartners_notes}\n` : ''}

### Key Activities
${analysisData.canvas?.keyActivities?.map((a: string) => `- ${a}`).join('\n') || '- N/A'}
${analysisData.canvas?.keyActivities_notes ? `\n**Additional Notes:**\n${analysisData.canvas.keyActivities_notes}\n` : ''}

### Key Resources
${analysisData.canvas?.keyResources?.map((r: string) => `- ${r}`).join('\n') || '- N/A'}
${analysisData.canvas?.keyResources_notes ? `\n**Additional Notes:**\n${analysisData.canvas.keyResources_notes}\n` : ''}

### Value Propositions
${analysisData.canvas?.valuePropositions?.map((v: string) => `- ${v}`).join('\n') || '- N/A'}
${analysisData.canvas?.valuePropositions_notes ? `\n**Additional Notes:**\n${analysisData.canvas.valuePropositions_notes}\n` : ''}

### Customer Relationships
${analysisData.canvas?.customerRelationships?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}
${analysisData.canvas?.customerRelationships_notes ? `\n**Additional Notes:**\n${analysisData.canvas.customerRelationships_notes}\n` : ''}

### Channels
${analysisData.canvas?.channels?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}
${analysisData.canvas?.channels_notes ? `\n**Additional Notes:**\n${analysisData.canvas.channels_notes}\n` : ''}

### Customer Segments
${analysisData.canvas?.customerSegments?.map((s: string) => `- ${s}`).join('\n') || '- N/A'}
${analysisData.canvas?.customerSegments_notes ? `\n**Additional Notes:**\n${analysisData.canvas.customerSegments_notes}\n` : ''}

### Cost Structure
${analysisData.canvas?.costStructure?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}
${analysisData.canvas?.costStructure_notes ? `\n**Additional Notes:**\n${analysisData.canvas.costStructure_notes}\n` : ''}

### Revenue Streams
${analysisData.canvas?.revenueStreams?.map((r: string) => `- ${r}`).join('\n') || '- N/A'}
${analysisData.canvas?.revenueStreams_notes ? `\n**Additional Notes:**\n${analysisData.canvas.revenueStreams_notes}\n` : ''}

## Similar Companies

${analysisData.similarCompanies?.map((comp: any) => `### ${comp.name || 'Unknown Company'}
${comp.description || 'N/A'}
Website: ${comp.website || 'N/A'}
`).join('\n') || 'N/A'}
`;

    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      toast({
        title: "Copied to Clipboard",
        description: "Analysis copied in Markdown format",
      });
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error('Copy failed:', err);
      toast({
        title: "Copy Failed",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    });
  };

  const handleSimilarCompanyChat = (company: any) => {
    setSelectedSimilarCompany(company);
    setSimilarCompanyChatOpen(true);
  };

  const startFreshAnalysis = () => {
    // "New analysis" must actually start over. It previously just re-expanded
    // the URL input above the old company — the old canvas stayed put and
    // there was no path to a clean slate (owner finding 2026-07-06).
    setAnalysisData(null);
    setHasAnalyzed(false);
    setIsNewAnalysis(false);
    setSearchCollapsed(false);
    setIsLoading(false);
    setAnalyzingLabel(undefined);
    clearActiveAnalysis();
    clearActiveWorkspaceName();
    sessionStorage.removeItem("loadedAnalysis");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSearchToggle = () => {
    if (searchCollapsed) {
      // Currently collapsed → expand it
      setSearchCollapsed(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hasAnalyzed && analysisData) {
      // Currently expanded with results → collapse it
      setSearchCollapsed(true);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  };

  return (
    <div className="bg-grid-subtle min-h-full p-6">
      {/* Main Content */}
      <main className="space-y-4 sm:space-y-8 md:space-y-12">
        
        {/* Copy Button - Top Right Corner — yields to the expanded Atlas dock */}
        {hasAnalyzed && !isLoading && analysisData && !atlasOpen && (
          <div className="fixed top-16 right-4 z-50">
            <Button
              onClick={copyToMarkdown}
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full shadow-xl bg-background/95 backdrop-blur-md border-2"
              title="Copy to clipboard"
              aria-label="Copy analysis to clipboard"
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </Button>
          </div>
        )}
        
        {/* Input Section — on the initial (pre-analysis) view this hero is
            vertically centered on the screen for a more premium feel. Once
            results exist it sits at the top of the page as a normal block. */}
        {!searchCollapsed && (
          <section
            className={cn(
              "animate-in fade-in slide-in-from-top duration-300",
              !hasAnalyzed && !isLoading
                ? "flex min-h-[calc(100vh-11rem)] flex-col justify-center"
                : "pt-0 md:pt-4",
            )}
          >
            <div className="mx-auto w-full max-w-xl">
              <div className="space-y-8 md:space-y-10">
                <div className="space-y-5 text-center">
                  {!isLoading && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                      <Sparkles className="h-3 w-3" />
                      AI-powered strategic analysis
                    </div>
                  )}

                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      {isLoading
                        ? "Researching your company"
                        : "Build your business source of truth"}
                    </h1>
                    <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {isLoading
                        ? `Gathering public data about ${analyzingLabel ?? "this company"}. Hang tight — this usually takes under a minute.`
                        : "Turn any company website into an AI-ready business profile. You verify the facts; we power the frameworks."}
                    </p>
                  </div>
                </div>

                {!isLoading && <ProcessSteps />}

                <UrlInput
                  onAnalyze={handleAnalyze}
                  isLoading={isLoading}
                  companyName={analyzingLabel ?? analysisData?.company?.name}
                />

                {!hasAnalyzed && !isLoading && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => navigate("/knowledge")}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      No website yet? Start from a pitch deck, plan, or text file instead
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {!hasAnalyzed && !isLoading && recentAnalyses.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground/60">
                    No contexts yet — enter a URL above to create your first
                    business model.
                  </p>
                )}

                {/* Collapse button when results exist */}
                {hasAnalyzed && analysisData && !isLoading && (
                  <div className="flex justify-center pt-2">
                    <Button
                      onClick={handleSearchToggle}
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span>Collapse and view results</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Saved Contexts — only shown when the user has previous analyses.
            The no-contexts empty state now lives inline in the hero above. */}
        {!searchCollapsed && !hasAnalyzed && !isLoading && recentAnalyses.length > 0 && (
          <section className="w-full max-w-7xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground mb-1">
                Your Saved Contexts
              </h2>
              <p className="text-sm text-muted-foreground">
                Continue refining or launch new strategy sessions from previous analyses.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentAnalyses.map((analysis) => (
            <button
              key={analysis.id}
              onClick={() => {
                setAnalysisData(analysis.analysis_data);
                persistActiveAnalysis(analysis.analysis_data, analysis.id);
                setHasAnalyzed(true);
                setIsNewAnalysis(false);
                setSearchCollapsed(true);
              }}
              className="group cursor-pointer bg-card border border-border rounded-xl
                         hover:border-primary/40 hover:shadow-sm
                         transition-colors duration-200
                         text-left h-36 flex flex-col p-6 focus-visible:ring-2 focus-visible:ring-ring"
            >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Search className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(analysis.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                      {analysis.company_name}
                    </h3>
                    <span className="text-sm text-primary font-medium whitespace-nowrap ml-4">View Context</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Results Section */}
        {hasAnalyzed && !isLoading && analysisData && (
          <div
            ref={resultsRef}
            className="mx-auto w-full max-w-7xl space-y-3 animate-in fade-in slide-in-from-bottom duration-500"
          >
            {isNewAnalysis && (
              <SuccessBanner
                companyName={analysisData.company?.name || "Unknown Company"}
              />
            )}

            {/* Company header */}
            <header className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm sm:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                    {analysisData.company?.name || "Unknown Company"}
                  </h1>
                  <p className="text-sm font-medium text-primary md:text-base">
                    {analysisData.company?.industry || "Unknown industry"}
                  </p>
                  <CompanyProfileDrawer
                    data={{
                      name: analysisData.company?.name || "Unknown Company",
                      industry: analysisData.company?.industry || "Unknown",
                      description:
                        analysisData.company?.description ||
                        "No description available",
                      productsServices: Array.isArray(
                        analysisData.company?.productsServices,
                      )
                        ? analysisData.company.productsServices
                        : [],
                      keyExecutives: Array.isArray(
                        analysisData.company?.keyExecutives,
                      )
                        ? analysisData.company.keyExecutives
                        : [],
                      website: analysisData.company?.website || "",
                      notes: analysisData.company?.notes,
                    }}
                    onUpdate={handleBusinessOverviewUpdate}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startFreshAnalysis}
                  className="shrink-0 gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  New company
                </Button>
              </div>
            </header>

            <section className="relative w-full">
              <EnterpriseBusinessModelCanvas
                compact
                data={{
                  keyPartners: Array.isArray(analysisData.canvas?.keyPartners) ? analysisData.canvas.keyPartners : [],
                  keyActivities: Array.isArray(analysisData.canvas?.keyActivities) ? analysisData.canvas.keyActivities : [],
                  keyResources: Array.isArray(analysisData.canvas?.keyResources) ? analysisData.canvas.keyResources : [],
                  valuePropositions: Array.isArray(analysisData.canvas?.valuePropositions) ? analysisData.canvas.valuePropositions : [],
                  customerRelationships: Array.isArray(analysisData.canvas?.customerRelationships) ? analysisData.canvas.customerRelationships : [],
                  channels: Array.isArray(analysisData.canvas?.channels) ? analysisData.canvas.channels : [],
                  customerSegments: Array.isArray(analysisData.canvas?.customerSegments) ? analysisData.canvas.customerSegments : [],
                  costStructure: Array.isArray(analysisData.canvas?.costStructure) ? analysisData.canvas.costStructure : [],
                  revenueStreams: Array.isArray(analysisData.canvas?.revenueStreams) ? analysisData.canvas.revenueStreams : [],
                  keyPartners_notes: analysisData.canvas?.keyPartners_notes,
                  keyActivities_notes: analysisData.canvas?.keyActivities_notes,
                  keyResources_notes: analysisData.canvas?.keyResources_notes,
                  valuePropositions_notes: analysisData.canvas?.valuePropositions_notes,
                  customerRelationships_notes: analysisData.canvas?.customerRelationships_notes,
                  channels_notes: analysisData.canvas?.channels_notes,
                  customerSegments_notes: analysisData.canvas?.customerSegments_notes,
                  costStructure_notes: analysisData.canvas?.costStructure_notes,
                  revenueStreams_notes: analysisData.canvas?.revenueStreams_notes,
                }}
                companyName={analysisData.company?.name || "Unknown Company"}
                businessContext={{
                  industry: analysisData.company?.industry || "",
                  description: analysisData.company?.description || "",
                  productsServices: Array.isArray(analysisData.company?.productsServices) ? analysisData.company.productsServices : [],
                  keyExecutives: Array.isArray(analysisData.company?.keyExecutives) ? analysisData.company.keyExecutives : [],
                  website: analysisData.company?.website || ""
                }}
                onSectionUpdate={handleBMCSectionUpdate}
                onEditorOpenChange={setBmcEditorOpen}
              />
            </section>

            <section className="relative w-full pt-4">
              <CompetitiveLandscape
                competitors={Array.isArray(analysisData.similarCompanies) ? analysisData.similarCompanies : []} 
                onSimilarCompanyChat={handleSimilarCompanyChat}
              />
            </section>
            
            {/* Floating CTA - hide when the BMC editor or the Atlas dock is open */}
            <FloatingCTA
              show={showPlaybooksCTA && !bmcEditorOpen && !atlasOpen}
              onNavigate={handleNavigateToPlaybooks}
              variant="floating"
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-24">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://tier4intelligence.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <img 
                src={logo} 
                alt="Tier 4 Intelligence" 
                className="h-12 w-auto"
              />
            </a>
            <p className="text-sm text-muted-foreground">
              © 2025 Super Business Model Canvas
            </p>
          </div>
        </div>
      </footer>

      <ChatDrawer
        open={similarCompanyChatOpen}
        onOpenChange={setSimilarCompanyChatOpen}
        mode="competitor"
        competitor={selectedSimilarCompany}
        companyName={analysisData?.company?.name || ""}
        businessContext={analysisData}
      />
      {/* Atlas rides beside the canvas it is helping to fill (spec 12 §6) —
          only once a company exists; the dock resolves its own account. */}
      {hasAnalyzed && analysisData && !isLoading && <AtlasDock onOpenChange={setAtlasOpen} />}
      <Toaster />
    </div>
  );
};

export default Analysis;
