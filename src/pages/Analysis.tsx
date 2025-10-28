import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UrlInput } from "@/components/UrlInput";
import { LoadingState } from "@/components/LoadingState";
import { BusinessOverview } from "@/components/BusinessOverview";
import { BusinessModelCanvas } from "@/components/BusinessModelCanvas";
import { CompetitiveLandscape } from "@/components/CompetitiveLandscape";
import { ChatDrawer } from "@/components/ChatDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, Search, ChevronUp, ArrowRight } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card as UICard, CardContent } from "@/components/ui/card";
import logo from "@/assets/logo_2.png";

const Analysis = () => {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [similarCompanyChatOpen, setSimilarCompanyChatOpen] = useState(false);
  const [selectedSimilarCompany, setSelectedSimilarCompany] = useState<any>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<any[]>([]);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load saved analysis from sessionStorage if available
  useEffect(() => {
    const loadedAnalysis = sessionStorage.getItem('loadedAnalysis');
    if (loadedAnalysis) {
      try {
        setAnalysisData(JSON.parse(loadedAnalysis));
        setHasAnalyzed(true);
        setSearchCollapsed(true);
        sessionStorage.removeItem('loadedAnalysis');
        // Ensure page starts at the top
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch (error) {
        console.error('Failed to load analysis:', error);
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
    setHasAnalyzed(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { url }
      });

      if (error) throw error;

      if (data) {
        setAnalysisData(data);
        setHasAnalyzed(true);
        setSearchCollapsed(true);
        toast({
          title: "Analysis Complete",
          description: "Business model canvas generated successfully",
        });
        
        // Scroll to results after a brief delay
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
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
    
    // Auto-save if user is logged in
    if (user && analysisData) {
      supabase
        .from('saved_analyses')
        .update({
          analysis_data: {
            ...analysisData,
            company: updatedData
          }
        })
        .eq('user_id', user.id)
        .eq('company_name', analysisData.company?.name || 'Unknown Company')
        .then(() => {
          toast({
            title: "Saved",
            description: "Business overview updated and saved",
          });
        });
    } else {
      toast({
        title: "Updated",
        description: "Business overview updated successfully",
      });
    }
  };

  const handleBMCSectionUpdate = (sectionTitle: string, updatedData: { items: string[]; notes: string }) => {
    const sectionKeyMap: Record<string, string> = {
      'Key Partners': 'keyPartners',
      'Key Activities': 'keyActivities',
      'Key Resources': 'keyResources',
      'Value Propositions': 'valuePropositions',
      'Customer Relationships': 'customerRelationships',
      'Channels': 'channels',
      'Customer Segments': 'customerSegments',
      'Cost Structure': 'costStructure',
      'Revenue Streams': 'revenueStreams'
    };
    
    const sectionKey = sectionKeyMap[sectionTitle];
    if (!sectionKey) return;

    const updatedCanvas = {
      ...analysisData.canvas,
      [sectionKey]: updatedData.items,
      [`${sectionKey}_notes`]: updatedData.notes
    };

    setAnalysisData({
      ...analysisData,
      canvas: updatedCanvas
    });

    // Auto-save if user is logged in
    if (user && analysisData) {
      supabase
        .from('saved_analyses')
        .update({
          analysis_data: {
            ...analysisData,
            canvas: updatedCanvas
          }
        })
        .eq('user_id', user.id)
        .eq('company_name', analysisData.company?.name || 'Unknown Company')
        .then(() => {
          toast({
            title: "Saved",
            description: `${sectionTitle} updated and saved`,
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
      navigate('/auth');
      return;
    }

    if (!analysisData) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('saved_analyses')
        .insert({
          user_id: user.id,
          company_name: analysisData.company?.name || 'Unknown Company',
          analysis_data: analysisData
        });

      if (error) throw error;

      toast({
        title: "Saved!",
        description: "Analysis saved to your account",
      });
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save analysis",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
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
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Tagline */}
      <div className="bg-background">
        <div className="container mx-auto px-4 md:px-6 pt-6 pb-3">
          <p className="text-muted-foreground font-montserrat font-light text-sm md:text-base tracking-wide">
            AI-Powered Strategic Business Analysis
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 space-y-16">
        
        {/* Collapsed Search Bar - Shows when results are loaded */}
        {searchCollapsed && hasAnalyzed && !isLoading && (
          <div className="sticky top-[88px] z-20 animate-in fade-in slide-in-from-top duration-300 -mx-6 px-6">
            <div className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-lg px-4 md:px-6 py-3 flex items-center justify-between gap-4 max-w-7xl mx-auto">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Search className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Analyzing</p>
                  <p className="text-base font-medium truncate">{analysisData?.company?.name || 'Company'}</p>
                </div>
              </div>
              <Button
                onClick={handleSearchToggle}
                variant="outline"
                size="sm"
                className="gap-2 flex-shrink-0"
              >
                <Search className="h-4 w-4" />
                <span className="hidden md:inline">New Search</span>
              </Button>
            </div>
          </div>
        )}
        
        {/* Action Buttons - Mobile */}
        {hasAnalyzed && !isLoading && analysisData && (
          <div className="md:hidden flex gap-2 px-4">
            <Button 
              onClick={saveAnalysis}
              variant="outline" 
              size="sm"
              className="flex-1 gap-2"
              disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button 
              onClick={copyToMarkdown}
              variant="outline" 
              size="sm"
              className="flex-1 gap-2"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        )}
        
        {/* Input Section */}
        {!searchCollapsed && (
          <section className="pt-0 md:pt-4 animate-in fade-in slide-in-from-top duration-300">
          <div className="w-full max-w-7xl mx-auto">
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-3xl font-semibold tracking-tight">Get Started</h2>
                <p className="text-muted-foreground text-sm">Enter a company URL to generate comprehensive business insights</p>
              </div>
              <UrlInput onAnalyze={handleAnalyze} isLoading={isLoading} />
              
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

        {/* Recent Analyses Section */}
        {!searchCollapsed && !hasAnalyzed && !isLoading && recentAnalyses.length > 0 && (
          <section className="w-full max-w-7xl mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-8">
              Recent Analyses
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentAnalyses.map((analysis) => (
                <button
                  key={analysis.id}
                  onClick={() => {
                    setAnalysisData(analysis.analysis_data);
                    setHasAnalyzed(true);
                    setSearchCollapsed(true);
                    setTimeout(() => {
                      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 300);
                  }}
                  className="card-mono card-mono-hover text-left h-36 flex flex-col p-6 group"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                    <Search className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors mb-auto">
                    {analysis.company_name}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-4">View analysis</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Results Section */}
        {isLoading && (
          <section className="animate-in fade-in duration-500">
            <LoadingState />
          </section>
        )}

        {hasAnalyzed && !isLoading && analysisData && (
          <div ref={resultsRef} className="space-y-12 animate-in fade-in slide-in-from-bottom duration-500">
            {/* CTA to Playbooks */}
            <div className="w-full max-w-7xl mx-auto">
              <UICard className="bg-primary/5 border-primary/20">
                <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4">
                  <div>
                    <h4 className="font-semibold mb-1">Next: Generate Strategic Insights</h4>
                    <p className="text-sm text-muted-foreground">
                      Use this business context to run strategic frameworks and get AI-powered recommendations
                    </p>
                  </div>
                  <Button onClick={() => navigate('/playbooks')} size="sm" className="whitespace-nowrap">
                    Go to Playbooks <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </UICard>
            </div>
            
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
                  website: analysisData.company?.website || "",
                  notes: analysisData.company?.notes
                }}
                onUpdate={handleBusinessOverviewUpdate}
              />
            </section>

            <section className="w-full max-w-7xl mx-auto">
              <div className="space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-semibold tracking-tight mb-2">
                    Business Model Canvas
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Click any section to view details and get AI insights
                  </p>
                </div>
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
              />
              </div>
            </section>

            <section className="w-full max-w-7xl mx-auto">
              <CompetitiveLandscape
                competitors={Array.isArray(analysisData.similarCompanies) ? analysisData.similarCompanies : []} 
                onSimilarCompanyChat={handleSimilarCompanyChat}
              />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.12] mt-24">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://tier4intelligence.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
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
      <Toaster />
    </div>
  );
};

export default Analysis;
