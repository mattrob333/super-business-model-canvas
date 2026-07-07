import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Sparkles, Clock, Users, Globe, Target, TrendingUp } from "lucide-react";
import { getCategoryColor } from "@/data/dummy-frameworks";
import { BusinessContextChat } from "@/components/BusinessContextChat";
import { FrameworkDetailModal } from "@/components/FrameworkDetailModal";
import { ReportViewerDrawer } from "@/components/ReportViewerDrawer";
import { FloatingChatButton } from "@/components/FloatingChatButton";
import { getActiveAnalysis } from "@/lib/active-analysis";
import { getActiveWorkspaceName } from "@/lib/active-workspace";
interface SavedAnalysis {
  id: string;
  company_name: string;
  analysis_data: any;
  created_at?: string;
}

interface Framework {
  id: string;
  title: string;
  shortcut?: string;
  category: string;
  description: string;
  estimated_time: number;
  departments: string[];
  when_to_use: string[];
  icon?: any;
}

interface Recommendation {
  framework_id: string;
  title: string;
  relevance_badge: string;
  alignment_statement: string;
  description: string;
  estimated_time: number;
}

/** Shared content width — goal input and card grids align */
const CONTENT_CLASS = "w-full max-w-6xl mx-auto";

const Playbooks = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SavedAnalysis | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [goalInput, setGoalInput] = useState("");
  const [chatState, setChatState] = useState<'closed' | 'minimized' | 'open'>('closed');
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [showFrameworkModal, setShowFrameworkModal] = useState(false);
  const [isReportDrawerOpen, setIsReportDrawerOpen] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [availableReports, setAvailableReports] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      fetchSavedAnalyses();
      fetchFrameworks();
    }
  }, [user, loading, navigate]);

  // Fetch available reports when company is selected
  useEffect(() => {
    if (selectedAnalysis && user) {
      fetchAvailableReports();
    } else {
      setAvailableReports([]);
      setSelectedReports([]);
    }
  }, [selectedAnalysis?.id, user]);

  // Load pre-selected context from sessionStorage if available
  useEffect(() => {
    const savedContext = sessionStorage.getItem('playbookContext');
    if (savedContext && savedAnalyses.length > 0) {
      try {
        const { companyName, businessContext } = JSON.parse(savedContext);
        // Find matching analysis by company name
        const matchingAnalysis = savedAnalyses.find(
          a => a.company_name === companyName
        );
        if (matchingAnalysis) {
          setSelectedAnalysis(matchingAnalysis);
        }
        // Clear the storage after loading
        sessionStorage.removeItem('playbookContext');
      } catch (error) {
        console.error('Failed to load playbook context:', error);
      }
    }
  }, [savedAnalyses]);

  // Auto-select active company from session / workspace when analyses load
  useEffect(() => {
    if (savedAnalyses.length === 0 || selectedAnalysis) return;

    const active = getActiveAnalysis();
    if (active?.id) {
      const byId = savedAnalyses.find((a) => a.id === active.id);
      if (byId) {
        setSelectedAnalysis(byId);
        return;
      }
    }

    const workspaceName = getActiveWorkspaceName();
    if (workspaceName) {
      const byName = savedAnalyses.find(
        (a) =>
          a.company_name === workspaceName ||
          a.analysis_data?.company?.name === workspaceName,
      );
      if (byName) setSelectedAnalysis(byName);
    }
  }, [savedAnalyses, selectedAnalysis]);

  const fetchSavedAnalyses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("saved_analyses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching analyses:", error);
      return;
    }

    setSavedAnalyses(data || []);
  };

  const fetchFrameworks = async () => {
    const { data, error } = await supabase
      .from("frameworks")
      .select("*")
      .eq("status", "active")
      .order("category", { ascending: true });

    if (error) {
      console.error("Error fetching frameworks:", error);
      return;
    }

    // Map frameworks with icons
    const iconMap: Record<string, any> = {
      'SWOT': Target,
      'PORTER': TrendingUp,
      'BMC': Target,
      'PESTLE': Globe,
      'ANSOFF': TrendingUp,
      '7S': Target,
      'VALUE_CHAIN': Target,
      'BCG': Target,
      'BSC': Target,
      'BLUE_OCEAN': Target,
      'COMPETE': Users,
      'JTBD': Target,
    };

    const mappedFrameworks = (data || []).map(f => ({
      ...f,
      icon: iconMap[f.shortcut] || Target,
      estimated_time: f.estimated_time || 15,
      when_to_use: f.when_to_use ? [f.when_to_use] : [],
    }));

    setFrameworks(mappedFrameworks);
  };

  const fetchAvailableReports = async () => {
    if (!selectedAnalysis || !user) return;

    const { data, error } = await supabase
      .from("generated_reports")
      .select(`
        id,
        framework_id,
        report_content,
        created_at,
      frameworks (
        title,
        shortcut,
        category
      )
      `)
      .eq("company_id", selectedAnalysis.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
      return;
    }

    setAvailableReports(data || []);
  };

  const categories = ["all", ...new Set(frameworks.map((f) => f.category))];
  const filteredFrameworks = selectedCategory === "all" 
    ? frameworks 
    : frameworks.filter((f) => f.category === selectedCategory);

  // Helper to add frameworks by shortcut
  const addFramework = (set: Set<Framework>, shortcuts: string[]) => {
    shortcuts.forEach(shortcut => {
      const framework = frameworks.find(f => f.shortcut === shortcut);
      if (framework && set.size < 10) {
        set.add(framework);
      }
    });
  };

  // Helper to extract numeric employee count
  const extractEmployeeCount = (count: string | undefined): number | null => {
    if (!count) return null;
    const match = count.match(/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  // Helper to check if competitive analysis exists
  const hasCompetitiveAnalysis = (): boolean => {
    return availableReports.some(r => 
      r.frameworks?.shortcut === 'PORTER' || 
      r.frameworks?.shortcut === 'SWOT'
    );
  };

  // Enhanced context-driven recommendation logic
  const getRecommendedFrameworks = (): Framework[] => {
    if (!selectedAnalysis) return [];
    
    const recommended: Set<Framework> = new Set();
    const analysisData = selectedAnalysis.analysis_data;
    const canvas = analysisData?.canvas || {};
    const company = analysisData?.company || {};
    
    // === BASELINE: Industry-Specific Recommendations ===
    const industry = (company.industry || '').toLowerCase();
    
    if (industry.includes('saas') || industry.includes('software') || industry.includes('tech')) {
      addFramework(recommended, ['ANSOFF', 'BCG', 'BLUE_OCEAN', 'VALUE_CHAIN']);
    } else if (industry.includes('nonprofit') || industry.includes('foundation') || industry.includes('scholarship')) {
      addFramework(recommended, ['BSC', 'VALUE_CHAIN', 'SWOT']);
    } else if (industry.includes('healthcare') || industry.includes('medical')) {
      addFramework(recommended, ['VALUE_CHAIN', 'PORTER', 'SWOT']);
    } else if (industry.includes('ecommerce') || industry.includes('retail') || industry.includes('marketplace')) {
      addFramework(recommended, ['JTBD', 'BMC', 'PORTER']);
    } else if (industry.includes('manufacturing')) {
      addFramework(recommended, ['VALUE_CHAIN', '7S']);
    }
    
    // === COMPANY STAGE/SIZE RECOMMENDATIONS ===
    const employeeCount = extractEmployeeCount(company.employeeCount);
    const foundingYear = company.foundingYear ? parseInt(company.foundingYear) : null;
    const companyAge = foundingYear ? new Date().getFullYear() - foundingYear : null;
    
    if (employeeCount && employeeCount < 50) {
      addFramework(recommended, ['BMC', 'JTBD', 'SWOT']);
    } else if (employeeCount && employeeCount > 1000) {
      addFramework(recommended, ['7S', 'BSC', 'PORTER']);
    }
    
    if (companyAge && companyAge < 5) {
      addFramework(recommended, ['JTBD', 'BMC', 'BLUE_OCEAN']);
    }
    
    // === MISSING CRITICAL CONTEXT ===
    const hasICP = canvas.customerSegments?.length > 0;
    const hasChannels = canvas.channels?.length > 0;
    const hasValueProps = canvas.valuePropositions?.length > 0;
    const hasCompetitors =
      (analysisData?.similarCompanies?.length ?? 0) > 0 ||
      (analysisData?.competitors?.length ?? 0) > 0;
    
    if (!hasICP) {
      addFramework(recommended, ['JTBD', 'BMC']);
    }
    
    if (!hasChannels) {
      addFramework(recommended, ['BMC', 'ANSOFF']);
    }
    
    if (!hasValueProps) {
      addFramework(recommended, ['VALUE_CHAIN', 'BLUE_OCEAN']);
    }
    
    if (hasCompetitors && !hasCompetitiveAnalysis()) {
      addFramework(recommended, ['PORTER', 'SWOT']);
    }
    
    // === GOAL-BASED REFINEMENT ===
    const goalLower = goalInput.toLowerCase();
    
    if (goalLower.includes('expansion') || goalLower.includes('new market') || goalLower.includes('geographic')) {
      addFramework(recommended, ['ANSOFF', 'PORTER', 'BLUE_OCEAN']);
    }
    
    if (goalLower.includes('cost') || goalLower.includes('efficiency') || goalLower.includes('margin') || goalLower.includes('ops')) {
      addFramework(recommended, ['VALUE_CHAIN', '7S']);
    }
    
    if (goalLower.includes('revenue') || goalLower.includes('growth') || goalLower.includes('pipeline') || goalLower.includes('acquisition')) {
      addFramework(recommended, ['BCG', 'ANSOFF', 'JTBD']);
    }
    
    if (goalLower.includes('position') || goalLower.includes('differentiat') || goalLower.includes('competitive')) {
      addFramework(recommended, ['PORTER', 'BLUE_OCEAN', 'SWOT']);
    }
    
    if (goalLower.includes('innovation') || goalLower.includes('disrupt')) {
      addFramework(recommended, ['BLUE_OCEAN', 'JTBD', 'ANSOFF']);
    }
    
    // === FILTER OUT ALREADY COMPLETED ===
    const completedFrameworks = new Set(
      availableReports.map(r => r.framework_id)
    );
    
    const filtered = Array.from(recommended).filter(f => 
      !completedFrameworks.has(f.id)
    );
    
    // === FALLBACK ===
    if (filtered.length === 0) {
      return frameworks.filter(f => 
        ['SWOT', 'BMC', 'PORTER', 'JTBD'].includes(f.shortcut || '')
      ).slice(0, 4);
    }
    
    return filtered.slice(0, 6);
  };

  // Check input availability for a framework
  const checkInputAvailability = (framework: Framework) => {
    if (!selectedAnalysis) return {};
    
    const analysisData = selectedAnalysis.analysis_data;
    const canvas = analysisData?.canvas || {};
    
    return {
      valueProps: canvas.valuePropositions && canvas.valuePropositions.length > 0,
      icp: canvas.customerSegments && canvas.customerSegments.length > 0,
      channels: canvas.channels && canvas.channels.length > 0,
      products: analysisData?.company?.productsServices && analysisData.company.productsServices.length > 0,
      competitors:
        (analysisData?.similarCompanies?.length ?? 0) > 0 ||
        (analysisData?.competitors?.length ?? 0) > 0,
    };
  };

  const recommendedFrameworks = useMemo(
    () => getRecommendedFrameworks(),
    [
      selectedAnalysis,
      frameworks,
      goalInput,
      availableReports,
    ],
  );

  const playbookGridClass =
    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";

  // Generate input status text
  const getInputStatusText = (framework: Framework) => {
    if (!selectedAnalysis) return null;
    
    const availability = checkInputAvailability(framework);
    
    return (
      <div className="text-xs text-muted-foreground pt-2 border-t">
        <span className="font-medium">Inputs from context: </span>
        <span className={availability.valueProps ? "text-success" : ""}>
          Value Props {availability.valueProps ? "✓" : "•"}
        </span>
        {" "}
        <span className={availability.icp ? "text-success" : ""}>
          ICP {availability.icp ? "✓" : "•"}
        </span>
        {" "}
        <span className={availability.channels ? "text-success" : ""}>
          Channels {availability.channels ? "✓" : "•"}
        </span>
        {" "}
        <span className={availability.competitors ? "text-success" : ""}>
          Competitors {availability.competitors ? "✓" : "•"}
        </span>
      </div>
    );
  };

  const openFramework = (frameworkId: string) => {
    if (!selectedAnalysis) {
      toast({
        title: "Select a company first",
        description: "Choose a company context so the AI can use your business model.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFramework(frameworkId);
    setShowFrameworkModal(true);
  };

  const handleStartChat = () => {
    if (!selectedAnalysis) {
      toast({
        title: "Select a company",
        description: "Please select a company context first",
        variant: "destructive",
      });
      return;
    }

    if (!goalInput.trim()) {
      toast({
        title: "Enter your goal",
        description: "Please describe what you'd like to discuss",
        variant: "destructive",
      });
      return;
    }

    setChatState('open');
  };

  const handleRunFramework = async (frameworkId: string) => {
    if (!selectedAnalysis) {
      toast({
        title: "Select a company",
        description: "Please select a company context first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setShowFrameworkModal(false);
    setIsReportDrawerOpen(true);
    setCurrentReportId(null);

    const framework = frameworks.find((f) => f.id === frameworkId);

    try {
      toast({
        title: "Generating playbook",
        description: `AI is analyzing ${selectedAnalysis.company_name} using ${framework?.title ?? "this framework"}…`,
      });

      const { data, error } = await supabase.functions.invoke('generate-framework-report', {
        body: {
          company_id: selectedAnalysis.id,
          framework_id: frameworkId,
          strategic_goal: goalInput.trim() || null,
        }
      });

      if (error) throw error;

      if (data?.report_id) {
        setCurrentReportId(data.report_id);
        
        // Auto-add report to selected reports
        setSelectedReports(prev => [...prev, data.report_id]);
        
        // Refresh available reports
        await fetchAvailableReports();
        
        toast({
          title: "Report Generated",
          description: `Report saved to ${selectedAnalysis.company_name} and added to chat context.`,
        });
      }
    } catch (error) {
      console.error("Error generating report:", error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
      setIsReportDrawerOpen(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerateReport = async () => {
    if (!selectedAnalysis || !selectedFramework) return;
    
    if (!confirm("Generate a fresh version of this report?")) return;

    await handleRunFramework(selectedFramework);
  };

  return (
    <div className={CONTENT_CLASS}>
      <main className="space-y-8 pb-8">
        {/* Page header */}
        <header className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Strategy
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Strategy Playbooks
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Run AI-powered frameworks on your company context. Set a goal, pick a
            playbook, and save the report to this company.
          </p>
        </header>

        {/* Context + goal — same width as card grids below */}
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Company context
              </label>
              <Select
                value={selectedAnalysis?.id || ""}
                onValueChange={(value) => {
                  const analysis = savedAnalyses.find((a) => a.id === value);
                  setSelectedAnalysis(analysis || null);
                }}
              >
                <SelectTrigger className="w-full border-primary/25">
                  <SelectValue placeholder="Select company…" />
                </SelectTrigger>
                <SelectContent>
                  {savedAnalyses.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No analyses yet
                    </SelectItem>
                  ) : (
                    savedAnalyses.map((analysis) => (
                      <SelectItem key={analysis.id} value={analysis.id}>
                        {analysis.company_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {savedAnalyses.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs font-semibold"
                    onClick={() => navigate("/canvas")}
                  >
                    Analyze a company first
                  </Button>
                </p>
              )}
            </div>

            {selectedAnalysis && (
              <div className="flex items-center gap-1.5 text-xs text-success sm:pb-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Context loaded for AI</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Your strategic goal
            </label>
            <Textarea
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="E.g., break into a new market, reduce CAC, or improve operational margins…"
              className="min-h-[100px] resize-none text-sm sm:text-base"
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                "Increase revenue / reduce CAC",
                "Enter a new market / launch a product",
                "Improve margins / cut ops waste",
              ].map((chipText) => (
                <Button
                  key={chipText}
                  variant="outline"
                  size="sm"
                  onClick={() => setGoalInput(chipText)}
                  className="h-8 text-xs"
                >
                  {chipText}
                </Button>
              ))}
            </div>
            <Button
              onClick={handleStartChat}
              disabled={!selectedAnalysis || !goalInput.trim()}
              className="shrink-0 gap-2 sm:min-w-[180px]"
            >
              <Sparkles className="h-4 w-4" />
              Start Strategy Session
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Strategy Coach and playbooks use your saved business model, company
            profile, and competitors from the Canvas.
          </p>
        </section>

        {/* Recommended Section */}
        {selectedAnalysis && recommendedFrameworks.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Recommended for {selectedAnalysis.company_name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Based on your goal, industry, and canvas data.
              </p>
            </div>
            <div className={`${playbookGridClass} animate-fade-in`}>
              {recommendedFrameworks.slice(0, 6).map((framework) => {
                const IconComponent = framework.icon || Target;
                return (
                  <Card 
                    key={framework.id}
                    onClick={() => openFramework(framework.id)}
                    className="group cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all duration-200 relative"
                  >
                    <Badge 
                      variant="secondary" 
                      className="absolute top-3 right-3 z-10 text-xs bg-primary/10 text-primary border-primary/30"
                    >
                      Recommended
                    </Badge>
                    <CardHeader>
                      <div className="flex items-start mb-3">
                        <div className={`p-3 rounded-lg ${getCategoryColor(framework.category)} border`}>
                          <IconComponent className="h-6 w-6" />
                        </div>
                      </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge 
                        variant="outline" 
                        className={`w-fit opacity-70 ${getCategoryColor(framework.category)}`}
                      >
                        {framework.category}
                      </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          <Clock className="h-3 w-3" />
                          {framework.estimated_time}m
                        </div>
                      </div>
                    <CardTitle className="text-xl font-medium group-hover:text-primary transition-colors tracking-tight">
                      {framework.title}
                    </CardTitle>
                      <CardDescription className="line-clamp-2 text-sm">
                        {framework.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <Users className="h-3 w-3" />
                        <span>{framework.departments?.length || 0} departments</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(framework.departments || []).slice(0, 3).map((dept) => (
                          <Badge key={dept} variant="secondary" className="text-xs">
                            {dept}
                          </Badge>
                        ))}
                        {(framework.departments || []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{(framework.departments || []).length - 3}
                          </Badge>
                        )}
                      </div>
                      {getInputStatusText(framework)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Framework Library */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">All playbooks</h2>
              <p className="text-sm text-muted-foreground">
                Browse frameworks — each run uses your company context and goal.
              </p>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat === "all" ? "All Categories" : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={`${playbookGridClass} animate-fade-in`}>
            {filteredFrameworks.map((framework) => {
              const IconComponent = framework.icon || Target;
              return (
                <Card 
                  key={framework.id}
                  onClick={() => openFramework(framework.id)}
                  className="group cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all duration-200"
                >
                  <CardHeader>
                    <div className="flex items-start mb-3">
                      <div className={`p-3 rounded-lg ${getCategoryColor(framework.category)} border`}>
                        <IconComponent className="h-6 w-6" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge 
                        variant="outline" 
                        className={`w-fit opacity-70 ${getCategoryColor(framework.category)}`}
                      >
                        {framework.category}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        <Clock className="h-3 w-3" />
                        {framework.estimated_time}m
                      </div>
                    </div>
                    <CardTitle className="text-xl font-medium group-hover:text-primary transition-colors tracking-tight">
                      {framework.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-sm">
                      {framework.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Users className="h-3 w-3" />
                      <span>{framework.departments?.length || 0} departments</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {(framework.departments || []).slice(0, 3).map((dept) => (
                        <Badge key={dept} variant="secondary" className="text-xs">
                          {dept}
                        </Badge>
                      ))}
                      {(framework.departments || []).length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{(framework.departments || []).length - 3}
                        </Badge>
                      )}
                    </div>
                    {getInputStatusText(framework)}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredFrameworks.length === 0 && (
            <div className="rounded-lg border border-dashed bg-muted/30 py-12 text-center">
              <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No frameworks found in this category.</p>
            </div>
          )}
        </section>

        {/* Persistent Chat Button - Always visible when company selected */}
        {selectedAnalysis && user && chatState === 'closed' && (
          <FloatingChatButton
            messageCount={0}
            companyName={selectedAnalysis.company_name}
            onClick={() => setChatState('open')}
          />
        )}

        {/* Business Context Chat */}
        {selectedAnalysis && user && (
          <BusinessContextChat
            chatState={chatState}
            onStateChange={setChatState}
            selectedAnalysis={selectedAnalysis}
            initialPrompt={goalInput}
            userId={user.id}
            availableReports={availableReports}
            selectedReports={selectedReports}
            onReportsChange={setSelectedReports}
          />
        )}

        {/* Framework Detail Modal */}
        <FrameworkDetailModal
          isOpen={showFrameworkModal}
          onClose={() => {
            setShowFrameworkModal(false);
            setSelectedFramework(null);
          }}
          framework={frameworks.find(f => f.id === selectedFramework) || null}
          onRunFramework={handleRunFramework}
          selectedAnalysis={selectedAnalysis}
          strategicGoal={goalInput.trim() || undefined}
        />

        {/* Report Viewer Drawer */}
        {selectedAnalysis && selectedFramework && (
          <ReportViewerDrawer
            isOpen={isReportDrawerOpen}
            onClose={() => setIsReportDrawerOpen(false)}
            reportId={currentReportId}
            frameworkId={selectedFramework}
            companyId={selectedAnalysis.id}
            companyName={selectedAnalysis.company_name}
            onRegenerate={handleRegenerateReport}
            isGenerating={isGenerating}
          />
        )}
      </main>
    </div>
  );
};

export default Playbooks;
