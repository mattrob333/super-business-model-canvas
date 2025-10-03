import { useState } from "react";
import { UrlInput } from "@/components/UrlInput";
import { LoadingState } from "@/components/LoadingState";
import { BusinessOverview } from "@/components/BusinessOverview";
import { BusinessModelCanvas } from "@/components/BusinessModelCanvas";
import { CompetitiveLandscape } from "@/components/CompetitiveLandscape";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const Analysis = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async (url: string) => {
    setIsLoading(true);
    setHasAnalyzed(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { url }
      });

      if (error) throw error;

      if (data) {
        setAnalysisData(data);
        setHasAnalyzed(true);
        toast({
          title: "Analysis Complete",
          description: "Business model canvas generated successfully",
        });
      }
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusinessOverviewUpdate = (updatedData: any) => {
    setAnalysisData({
      ...analysisData,
      company: updatedData
    });
    toast({
      title: "Updated",
      description: "Business overview updated successfully",
    });
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

## Business Model Canvas

### Key Partners
${analysisData.canvas?.keyPartners?.map((p: string) => `- ${p}`).join('\n') || '- N/A'}

### Key Activities
${analysisData.canvas?.keyActivities?.map((a: string) => `- ${a}`).join('\n') || '- N/A'}

### Key Resources
${analysisData.canvas?.keyResources?.map((r: string) => `- ${r}`).join('\n') || '- N/A'}

### Value Propositions
${analysisData.canvas?.valuePropositions?.map((v: string) => `- ${v}`).join('\n') || '- N/A'}

### Customer Relationships
${analysisData.canvas?.customerRelationships?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}

### Channels
${analysisData.canvas?.channels?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}

### Customer Segments
${analysisData.canvas?.customerSegments?.map((s: string) => `- ${s}`).join('\n') || '- N/A'}

### Cost Structure
${analysisData.canvas?.costStructure?.map((c: string) => `- ${c}`).join('\n') || '- N/A'}

### Revenue Streams
${analysisData.canvas?.revenueStreams?.map((r: string) => `- ${r}`).join('\n') || '- N/A'}

## Competitive Landscape

${analysisData.competitors?.map((comp: any) => `### ${comp.name || 'Unknown Competitor'}
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/[0.12] backdrop-blur-sm sticky top-0 z-30 bg-background/80">
        <div className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h1 className="text-lg md:text-2xl font-semibold tracking-tight">Super Business Model Canvas</h1>
                <p className="text-xs md:text-sm text-muted-foreground">AI-Powered Strategic Analysis</p>
              </div>
              <div className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
                <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                <span className="label-tech text-primary text-[9px]">Powered by AI</span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              {hasAnalyzed && !isLoading && analysisData && (
                <Button 
                  onClick={copyToMarkdown}
                  variant="outline" 
                  size="sm"
                  className="gap-2 h-8 md:h-9 text-xs md:text-sm"
                >
                  {copied ? <Check className="h-3 w-3 md:h-4 md:w-4" /> : <Copy className="h-3 w-3 md:h-4 md:w-4" />}
                  {copied ? "Copied!" : "Copy Analysis"}
                </Button>
              )}
              <div className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                <span className="label-tech text-primary text-[10px]">Powered by AI</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 space-y-16">
        {/* Input Section */}
        <section className="pt-8">
          <UrlInput onAnalyze={handleAnalyze} isLoading={isLoading} />
        </section>

        {/* Results Section */}
        {isLoading && (
          <section className="animate-in fade-in duration-500">
            <LoadingState />
          </section>
        )}

        {hasAnalyzed && !isLoading && analysisData && (
          <div className="space-y-16 animate-in fade-in duration-700">
            <section>
              <BusinessOverview 
                data={{
                  name: analysisData.company?.name || "Unknown Company",
                  industry: analysisData.company?.industry || "Unknown",
                  description: analysisData.company?.description || "No description available",
                  productsServices: Array.isArray(analysisData.company?.productsServices) 
                    ? analysisData.company.productsServices 
                    : [],
                  keyExecutives: Array.isArray(analysisData.company?.keyExecutives)
                    ? analysisData.company.keyExecutives
                    : [],
                  website: analysisData.company?.website || ""
                }}
                onUpdate={handleBusinessOverviewUpdate}
              />
            </section>

            <section>
              <BusinessModelCanvas 
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
                }}
                companyName={analysisData.company?.name || "Unknown Company"}
                businessContext={{
                  industry: analysisData.company?.industry || "",
                  description: analysisData.company?.description || "",
                  productsServices: Array.isArray(analysisData.company?.productsServices) ? analysisData.company.productsServices : [],
                  keyExecutives: Array.isArray(analysisData.company?.keyExecutives) ? analysisData.company.keyExecutives : [],
                  website: analysisData.company?.website || ""
                }}
              />
            </section>

            <section>
              <CompetitiveLandscape competitors={Array.isArray(analysisData.competitors) ? analysisData.competitors : []} />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.12] mt-24">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>© 2025 Super Business Model Canvas</p>
            <p className="label-tech text-[10px]">Strategic Analysis Tool</p>
          </div>
        </div>
      </footer>
      <Toaster />
    </div>
  );
};

export default Analysis;
