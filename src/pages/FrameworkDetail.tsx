import { useState, useEffect } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Clock, Users, Target, ChevronRight } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface Framework {
  id: string;
  title: string;
  shortcut: string;
  category: string;
  description: string;
  when_to_use: string;
  departments: string[];
  stages: string[];
  goal_alignment: string[];
  estimated_time: number;
}

const FrameworkDetail = () => {
  const { frameworkId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [framework, setFramework] = useState<Framework | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const companyId = location.state?.companyId;
  const strategicGoal = location.state?.goal;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      fetchFramework();
    }
  }, [frameworkId, user, authLoading, navigate]);

  const fetchFramework = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("frameworks")
      .select("*")
      .eq("id", frameworkId)
      .single();

    if (error) {
      console.error("Error fetching framework:", error);
      toast({
        title: "Error",
        description: "Failed to load framework details",
        variant: "destructive",
      });
      return;
    }

    setFramework(data);
    setIsLoading(false);
  };

  const handleGenerateReport = async () => {
    if (!companyId) {
      toast({
        title: "No company selected",
        description: "Please select a company from the Playbooks page first",
        variant: "destructive",
      });
      navigate("/playbooks");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-framework-report", {
        body: {
          company_id: companyId,
          framework_id: frameworkId,
          strategic_goal: strategicGoal,
        },
      });

      if (error) throw error;

      toast({
        title: "Report generated!",
        description: "Your strategic report is ready to view",
      });

      navigate(`/playbooks/reports/${data.report_id}`);
    } catch (error) {
      console.error("Error generating report:", error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container max-w-4xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-8" />
          <Card className="p-8">
            <Skeleton className="h-12 w-3/4 mb-4" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-2/3" />
          </Card>
        </div>
      </div>
    );
  }

  if (!framework) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="border-b bg-muted/30">
        <div className="container max-w-4xl mx-auto px-4 py-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate('/')} className="cursor-pointer">
                  Home
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate('/playbooks')} className="cursor-pointer">
                  Playbooks
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{framework?.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      <div className="container max-w-4xl mx-auto px-4 py-8">

        <Card className="p-8 space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-muted-foreground">
                {framework.shortcut}
              </span>
              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                {framework.category}
              </span>
            </div>
            <h1 className="text-4xl font-bold">{framework.title}</h1>
            <p className="text-lg text-muted-foreground">{framework.description}</p>
          </div>

          {/* Metadata */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-1" />
              <div>
                <p className="text-sm font-semibold">Estimated Time</p>
                <p className="text-sm text-muted-foreground">{framework.estimated_time} minutes</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-primary mt-1" />
              <div>
                <p className="text-sm font-semibold">Departments</p>
                <p className="text-sm text-muted-foreground">{framework.departments?.join(", ")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Target className="h-5 w-5 text-primary mt-1" />
              <div>
                <p className="text-sm font-semibold">Company Stages</p>
                <p className="text-sm text-muted-foreground">{framework.stages?.join(", ")}</p>
              </div>
            </div>
          </div>

          {/* When to Use */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">When to Use</h2>
            <div className="text-muted-foreground">
              {framework.when_to_use}
            </div>
          </div>

          {/* Goal Alignment */}
          {framework.goal_alignment && framework.goal_alignment.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Goal Alignment</h2>
              <div className="flex flex-wrap gap-2">
                {framework.goal_alignment.map((goal, idx) => (
                  <span key={idx} className="text-xs bg-secondary px-3 py-1 rounded-full">
                    {goal.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Generate Report Button */}
          <div className="pt-6 border-t">
            <Button
              onClick={handleGenerateReport}
              disabled={isGenerating}
              size="lg"
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate {framework.title} Report
                  {companyId && " for Selected Company"}
                </>
              )}
            </Button>
            {!companyId && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Select a company from the Playbooks page to generate a customized report
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FrameworkDetail;
