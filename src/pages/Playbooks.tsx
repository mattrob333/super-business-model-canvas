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

interface SavedAnalysis {
  id: string;
  company_name: string;
  analysis_data: any;
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
  const [initialResearchMode, setInitialResearchMode] = useState(false);
  const [isReportDrawerOpen, setIsReportDrawerOpen] = useState(false);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);

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
    };

    const mappedFrameworks = (data || []).map(f => ({
      ...f,
      icon: iconMap[f.shortcut] || Target,
      estimated_time: f.estimated_time || 15,
      when_to_use: f.when_to_use ? [f.when_to_use] : [],
    }));

    setFrameworks(mappedFrameworks);
  };

  const categories = ["all", ...new Set(frameworks.map((f) => f.category))];
  const filteredFrameworks = selectedCategory === "all" 
    ? frameworks 
    : frameworks.filter((f) => f.category === selectedCategory);

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
        toast({
          title: "Report Generated",
          description: "Your strategic report is ready",
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 pb-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              Strategy Playbooks
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Get AI-powered strategy recommendations tailored to your business
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
            {selectedAnalysis && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 mt-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Context loaded</span>
              </div>
            )}
          </div>

          {/* Large Prominent Chat Input - Centered */}
          <div className="max-w-5xl mx-auto">
            <div className="relative border-2 border-primary/20 rounded-lg bg-card p-3 sm:p-4 shadow-sm hover:border-primary/40 transition-colors">
              <Textarea 
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="E.g., 'We want to break into a new market and drive customer acquisition' or 'Need to improve operational efficiency and reduce costs'"
                className="min-h-[120px] sm:min-h-[150px] border-none bg-transparent resize-none focus-visible:ring-0 text-sm sm:text-base"
              />
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-3 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center sm:justify-start">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">AI Strategy Assistant</span>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 justify-center sm:justify-start sm:border-l sm:pl-4">
                    <Switch
                      id="initial-research-mode"
                      checked={initialResearchMode}
                      onCheckedChange={setInitialResearchMode}
                    />
                    <Label 
                      htmlFor="initial-research-mode" 
                      className="text-xs sm:text-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Research Mode
                    </Label>
                  </div>
                  <Button 
                    onClick={handleStartChat}
                    disabled={!selectedAnalysis || !goalInput.trim()}
                    className="w-full sm:w-auto min-h-[44px]"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Strategy Session
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Framework Library */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Available Playbooks</h2>
              <p className="text-muted-foreground">Browse and select frameworks to run on your business</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredFrameworks.map((framework) => {
              const IconComponent = framework.icon || Target;
              return (
                <Card 
                  key={framework.id}
                  onClick={() => {
                    setSelectedFramework(framework.id);
                    setShowFrameworkModal(true);
                  }}
                  className="group cursor-pointer hover:border-primary transition-all hover:shadow-lg hover:-translate-y-1 duration-300"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${getCategoryColor(framework.category)} border`}>
                        <IconComponent className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        <Clock className="h-3 w-3" />
                        {framework.estimated_time}m
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`w-fit mb-2 ${getCategoryColor(framework.category)}`}
                    >
                      {framework.category}
                    </Badge>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
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
                    <div className="flex flex-wrap gap-1">
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

        {/* Business Context Chat */}
        {selectedAnalysis && user && (
          <BusinessContextChat
            chatState={chatState}
            onStateChange={setChatState}
            selectedAnalysis={selectedAnalysis}
            initialPrompt={goalInput}
            userId={user.id}
            initialResearchMode={initialResearchMode}
          />
        )}

        {/* Framework Detail Modal */}
      <FrameworkDetailModal
        isOpen={showFrameworkModal}
        onClose={() => setShowFrameworkModal(false)}
        framework={frameworks.find(f => f.id === selectedFramework) || null}
        onRunFramework={handleRunFramework}
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
