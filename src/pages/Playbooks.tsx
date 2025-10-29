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
import { CheckCircle2, Sparkles, Clock, Users } from "lucide-react";
import { DUMMY_FRAMEWORKS, getCategoryColor } from "@/data/dummy-frameworks";
import { BusinessContextChat } from "@/components/BusinessContextChat";
import { FrameworkDetailModal } from "@/components/FrameworkDetailModal";

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
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [goalInput, setGoalInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [showFrameworkModal, setShowFrameworkModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    
    if (user) {
      fetchSavedAnalyses();
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

  const categories = ["all", ...new Set(DUMMY_FRAMEWORKS.map((f) => f.category))];
  const filteredFrameworks = selectedCategory === "all" 
    ? DUMMY_FRAMEWORKS 
    : DUMMY_FRAMEWORKS.filter((f) => f.category === selectedCategory);

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

    setChatOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Hero Section - Centered */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4 pb-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              Strategy Playbooks
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
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
            <div className="relative border-2 border-primary/20 rounded-lg bg-card p-4 shadow-sm hover:border-primary/40 transition-colors">
              <Textarea 
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                placeholder="E.g., 'We want to break into a new market and drive customer acquisition' or 'Need to improve operational efficiency and reduce costs'"
                className="min-h-[150px] border-none bg-transparent resize-none focus-visible:ring-0 text-base"
              />
              
              <div className="flex items-center justify-between mt-3 pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  <span>AI Strategy Assistant</span>
                </div>
                <Button 
                  onClick={handleStartChat}
                  disabled={!selectedAnalysis || !goalInput.trim()}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Strategy Session
                </Button>
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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFrameworks.map((framework) => {
              const IconComponent = framework.icon;
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
                        {framework.estimatedTime}m
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
                      <span>{framework.departments.length} departments</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {framework.departments.slice(0, 3).map((dept) => (
                        <Badge key={dept} variant="secondary" className="text-xs">
                          {dept}
                        </Badge>
                      ))}
                      {framework.departments.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{framework.departments.length - 3}
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
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            selectedAnalysis={selectedAnalysis}
            initialPrompt={goalInput}
            userId={user.id}
          />
        )}

        {/* Framework Detail Modal */}
        <FrameworkDetailModal
          isOpen={showFrameworkModal}
          onClose={() => setShowFrameworkModal(false)}
          frameworkId={selectedFramework}
          onRunFramework={(id) => {
            console.log("Running framework:", id);
            toast({
              title: "Framework Started",
              description: "This will generate a report in the next phase"
            });
            setShowFrameworkModal(false);
          }}
        />
      </main>
    </div>
  );
};

export default Playbooks;
