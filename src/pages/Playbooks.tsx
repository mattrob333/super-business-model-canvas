import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, ArrowRight, CheckCircle2, Sparkles, BookOpen } from "lucide-react";

interface SavedAnalysis {
  id: string;
  company_name: string;
  analysis_data: any;
}

interface Framework {
  id: string;
  title: string;
  shortcut: string;
  category: string;
  description: string;
  estimated_time: number;
  status: string;
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
  const [goalInput, setGoalInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState<{ insights: string[]; frameworks: Recommendation[] } | null>(null);
  const [allFrameworks, setAllFrameworks] = useState<Framework[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      fetchSavedAnalyses();
      fetchAllFrameworks();
    }
  }, [user, loading, navigate]);

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

  const fetchAllFrameworks = async () => {
    const { data, error } = await supabase
      .from("strategic_frameworks")
      .select("*")
      .eq("status", "active")
      .order("title");

    if (error) {
      console.error("Error fetching frameworks:", error);
      return;
    }

    setAllFrameworks(data || []);
  };

  const handleGetStrategy = async () => {
    if (!selectedAnalysis || !goalInput.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a company and describe your goals",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-frameworks", {
        body: {
          company_id: selectedAnalysis.id,
          company_name: selectedAnalysis.company_name,
          goal_input: goalInput,
        },
      });

      if (error) throw error;

      setRecommendations({
        insights: data.insights || [],
        frameworks: data.frameworks || [],
      });

      toast({
        title: "Recommendations ready!",
        description: `Found ${data.frameworks?.length || 0} relevant frameworks for your goals`,
      });
    } catch (error) {
      console.error("Error getting recommendations:", error);
      toast({
        title: "Error",
        description: "Failed to generate recommendations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const categories = ["all", ...Array.from(new Set(allFrameworks.map(f => f.category)))];
  const filteredFrameworks = selectedCategory === "all" 
    ? allFrameworks 
    : allFrameworks.filter(f => f.category === selectedCategory);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            What do you want to achieve?
          </h1>
          <p className="text-muted-foreground text-lg">
            Describe your business goals and get AI-powered strategy recommendations
          </p>
        </section>

        {/* Input Section */}
        <section className="mb-12 max-w-4xl mx-auto">
          <Card className="p-6 space-y-6">
            {/* Company Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Company Context</label>
              <Select
                value={selectedAnalysis?.id}
                onValueChange={(value) => {
                  const analysis = savedAnalyses.find(a => a.id === value);
                  setSelectedAnalysis(analysis || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a company..." />
                </SelectTrigger>
                <SelectContent>
              {savedAnalyses.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No analyses yet - create one first
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
                <div className="text-sm text-muted-foreground">
                  No business context found. <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/analyze')}>Create one first</Button>
                </div>
              )}
              {selectedAnalysis && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Context loaded</span>
                </div>
              )}
            </div>

            {/* Goal Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                AI Strategy Assistant
              </label>
              <Textarea
                placeholder="Describe your business goals in detail... (e.g., 'Increase revenue by 40% in Q1, expand into new markets, improve competitive positioning')"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {goalInput.length} characters
              </p>
            </div>

            <Button
              onClick={handleGetStrategy}
              disabled={!selectedAnalysis || !goalInput.trim() || isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Get Strategy
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </Card>
        </section>

        {/* Recommendations Panel */}
        {recommendations && (
          <section className="mb-12 max-w-4xl mx-auto animate-fade-in">
            <Card className="p-6 space-y-6">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-bold">AI Strategy Recommendations</h2>
              </div>

              {/* Key Insights */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold">💡 Key Strategic Insights</h3>
                {recommendations.insights.map((insight, idx) => (
                  <div key={idx} className="flex gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground">{insight}</p>
                  </div>
                ))}
              </div>

              {/* Recommended Frameworks */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">📋 Recommended Frameworks</h3>
                <div className="grid gap-4">
                  {recommendations.frameworks.map((framework) => (
                    <Card
                      key={framework.framework_id}
                      className="p-4 cursor-pointer hover:border-primary transition-colors"
                      onClick={() => navigate(`/playbooks/framework/${framework.framework_id}`, {
                        state: { companyId: selectedAnalysis?.id, goal: goalInput }
                      })}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold mb-1">{framework.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            {framework.alignment_statement}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {framework.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            framework.relevance_badge === "High Relevance" 
                              ? "bg-green-500/20 text-green-600"
                              : "bg-yellow-500/20 text-yellow-600"
                          }`}>
                            {framework.relevance_badge}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {framework.estimated_time} min
                          </span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </Card>
          </section>
        )}

        {/* Available Frameworks Browser */}
        <section className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold">Available Playbooks</h2>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[250px]">
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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFrameworks.map((framework) => (
              <Card
                key={framework.id}
                className="p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => navigate(`/playbooks/framework/${framework.id}`)}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{framework.title}</h3>
                      <p className="text-xs text-muted-foreground">{framework.shortcut}</p>
                    </div>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      {framework.estimated_time} min
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {framework.description}
                  </p>
                  <p className="text-xs text-muted-foreground">{framework.category}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Playbooks;
