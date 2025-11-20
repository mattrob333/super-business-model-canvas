import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Sparkles, Clock, Users, Globe, Target, TrendingUp, Bot } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getCategoryColor } from "@/data/dummy-frameworks";
import { BusinessContextChat } from "@/components/BusinessContextChat";
import { FrameworkDetailModal } from "@/components/FrameworkDetailModal";
import { ReportViewerDrawer } from "@/components/ReportViewerDrawer";
import { FloatingChatButton } from "@/components/FloatingChatButton";

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

  const fetchSavedAnalyses = async () => {
    const { data, error } = await supabase
      .from("saved_analyses")
      .select("*")
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
    const hasCompetitors = analysisData.competitors?.length > 0;
    
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
      products: analysisData.company?.productsServices && analysisData.company.productsServices.length > 0,
      competitors: analysisData.competitors && analysisData.competitors.length > 0,
    };
  };

  // Generate input status text
  const getInputStatusText = (framework: Framework) => {
    if (!selectedAnalysis) return null;
    
    const availability = checkInputAvailability(framework);
    
    return (
      <div className="text-xs text-muted-foreground pt-2 border-t">
        <span className="font-medium">Inputs from context: </span>
        <span className={availability.valueProps ? "text-green-600" : ""}>
          Value Props {availability.valueProps ? "✓" : "•"}
        </span>
        {" "}
        <span className={availability.icp ? "text-green-600" : ""}>
          ICP {availability.icp ? "✓" : "•"}
        </span>
        {" "}
        <span className={availability.channels ? "text-green-600" : ""}>
          Channels {availability.channels ? "✓" : "•"}
        </span>
      </div>
    );
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

    try {
      const { data, error } = await supabase.functions.invoke('generate-framework-report', {
        body: {
          company_id: selectedAnalysis.id,
          framework_id: frameworkId,
          strategic_goal: goalInput || null
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
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section - Centered */}
        <div className="mb-12">
          <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 pb-2 text-primary tracking-tight">
          Strategy Playbooks
        </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto font-light">
              Use your Context File to get tailored strategy moves. Describe a goal or pick a playbook—then save the report to this company.
            </p>
          </div>

          {/* Centered Company Selector - Inline Above Chat */}
          <div className="max-w-5xl mx-auto mb-6">
            <label className="text-xs text-muted-foreground mb-1.5 block text-center">
              Company Context
            </label>
            <Select
              value={selectedAnalysis?.id || ""}
              onValueChange={(value) => {
                const analysis = savedAnalyses.find((a) => a.id === value);
                setSelectedAnalysis(analysis || null);
              }}
            >
              <SelectTrigger className="w-full border-primary/30 hover:border-primary/50 transition-colors">
                <SelectValue placeholder="Select company..." />
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
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-xs font-semibold" 
                  onClick={() => navigate('/analyze')}
                >
                  Create one first
                </Button>
              </p>
            )}
            {selectedAnalysis ? (
              <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 mt-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Context loaded</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Last verified: {new Date(selectedAnalysis.created_at || Date.now()).toLocaleDateString()}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">Version v1</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                Select a company to tailor recommendations
              </p>
            )}
          </div>

          {/* Large Prominent Chat Input - Centered */}
          <div className="max-w-5xl mx-auto space-y-2">
            <label className="block text-sm font-medium text-muted-foreground text-center mb-2">
              Tell the Strategy Coach your goal
            </label>
            <div className="relative border border-primary/90 rounded-xl bg-card p-5 sm:p-7 shadow-[0_0_60px_rgba(196,248,42,0.2),0_0_30px_rgba(196,248,42,0.15),0_4px_20px_rgba(0,0,0,0.5),inset_0_2px_8px_rgba(0,0,0,0.3),inset_0_0_20px_rgba(196,248,42,0.08)] hover:shadow-[0_0_80px_rgba(196,248,42,0.3),0_0_40px_rgba(196,248,42,0.2),0_8px_28px_rgba(0,0,0,0.6),inset_0_2px_8px_rgba(0,0,0,0.3),inset_0_0_24px_rgba(196,248,42,0.1)] focus-within:shadow-[0_0_80px_rgba(196,248,42,0.28),0_0_40px_rgba(196,248,42,0.18),0_4px_20px_rgba(0,0,0,0.5),inset_0_2px_8px_rgba(0,0,0,0.3),inset_0_0_24px_rgba(196,248,42,0.1)] transition-all duration-300">
              <Textarea 
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="E.g., 'We want to break into a new market and drive customer acquisition' or 'Need to improve operational efficiency and reduce costs'"
                className="min-h-[120px] sm:min-h-[150px] border-none bg-transparent resize-none focus-visible:ring-0 text-sm sm:text-base"
              />
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center sm:justify-start">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">AI Strategy Assistant</span>
                </div>
                <Button 
                  onClick={handleStartChat}
                  disabled={!selectedAnalysis || !goalInput.trim()}
                  className="w-full sm:w-auto min-h-[44px] hover:shadow-[0_0_20px_rgba(196,248,42,0.3)] transition-all duration-300"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Strategy Session
                </Button>
              </div>
            </div>

            {/* Quick-start chips */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {[
                "Increase revenue / reduce CAC",
                "Enter a new market / launch a product",
                "Improve margins / cut ops waste"
              ].map((chipText) => (
                <Button
                  key={chipText}
                  variant="outline"
                  size="sm"
                  onClick={() => setGoalInput(chipText)}
                  className="text-xs px-4 py-2 text-white hover:text-white border-primary/20 hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_12px_rgba(196,248,42,0.2)] active:scale-95 transition-all duration-200"
                >
                  {chipText}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Recommended Section */}
        {selectedAnalysis && getRecommendedFrameworks().length > 0 && (
          <div className="mt-16 mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-medium mb-2 text-foreground tracking-wide">Recommended for {selectedAnalysis.company_name}</h2>
              <p className="text-muted-foreground font-light">Based on your goals, stage, ICP, and channels.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in">
              {getRecommendedFrameworks().slice(0, 6).map((framework) => {
                const IconComponent = framework.icon || Target;
                return (
                  <Card 
                    key={framework.id}
                    onClick={() => {
                      setSelectedFramework(framework.id);
                      setShowFrameworkModal(true);
                    }}
                    className="group cursor-pointer bg-gradient-to-b from-[#151515] to-[#0C0C0C] border border-white/[0.08] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] hover:border-primary hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_20px_rgba(196,248,42,0.15)] hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300 relative"
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
          </div>
        )}

        {/* Premium section separator */}
        {selectedAnalysis && getRecommendedFrameworks().length > 0 && (
          <div className="my-16">
            <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          </div>
        )}

        {/* Framework Library */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2 tracking-wide" style={{ marginTop: '70px' }}>All Playbooks</h2>
              <p className="text-muted-foreground font-light">Browse and select frameworks to run on your business</p>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[200px]">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in">
            {filteredFrameworks.map((framework) => {
              const IconComponent = framework.icon || Target;
              return (
                <Card 
                  key={framework.id}
                  onClick={() => {
                    setSelectedFramework(framework.id);
                    setShowFrameworkModal(true);
                  }}
                  className="group cursor-pointer bg-gradient-to-b from-[#151515] to-[#0C0C0C] border border-white/[0.08] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] hover:border-primary hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_20px_rgba(196,248,42,0.15)] hover:-translate-y-1 hover:scale-[1.02] transition-all duration-300"
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
            <div className="text-center py-12 bg-muted/30 rounded-lg border-2 border-dashed">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No frameworks found in this category.</p>
            </div>
          )}
        </div>

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
