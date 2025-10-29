import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UrlInput } from "@/components/UrlInput";
import { LoadingState } from "@/components/LoadingState";
import { BusinessOverview } from "@/components/BusinessOverview";
import { BusinessModelCanvas } from "@/components/BusinessModelCanvas";
import { CompetitiveLandscape } from "@/components/CompetitiveLandscape";
import { ChatDrawer } from "@/components/ChatDrawer";
import { ProcessSteps } from "@/components/ProcessSteps";
import { SuccessBanner } from "@/components/SuccessBanner";
import { FloatingCTA } from "@/components/FloatingCTA";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Copy, Check, Save, Search, ChevronUp, ArrowRight, Loader2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card as UICard, CardContent } from "@/components/ui/card";
import logo from "@/assets/logo_2.png";

const Analysis = () => {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
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
  const resultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

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

  // Load saved analysis from sessionStorage if available
  useEffect(() => {
    const loadedAnalysis = sessionStorage.getItem('loadedAnalysis');
    if (loadedAnalysis) {
      try {
        setAnalysisData(JSON.parse(loadedAnalysis));
        setHasAnalyzed(true);
        setIsNewAnalysis(false);
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
    setReviewedSections(0);
    setShowPlaybooksCTA(false);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-company', {
        body: { url }
      });

      if (error) throw error;

      if (data) {
        setAnalysisData(data);
        setHasAnalyzed(true);
        setIsNewAnalysis(true);
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
    
    // Mark section as reviewed
    setReviewedSections(prev => prev + 1);
    
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

    // Track unique reviewed sections
    setReviewedSections(prev => Math.min(prev + 1, 11));

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
      const companyName = analysisData.company?.name || 'Unknown Company';
      
      // Check for existing analysis
      const { data: existing } = await supabase
        .from('saved_analyses')
        .select('id')
        .eq('user_id', user.id)
        .eq('company_name', companyName)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('saved_analyses')
          .update({
            analysis_data: analysisData,
          })
          .eq('id', existing.id);

        if (error) throw error;
        
        toast({
          title: "Updated!",
          description: "Analysis updated in your account",
        });
      } else {
        // Insert new record
        const { error } = await supabase
          .from('saved_analyses')
          .insert({
            user_id: user.id,
            company_name: companyName,
            analysis_data: analysisData
          });

        if (error) throw error;

        toast({
          title: "Saved!",
          description: "Analysis saved to your account",
        });
      }
      
      // Refresh recent analyses list
      const { data } = await supabase
        .from('saved_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (data) setRecentAnalyses(data);
      
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

  const handleNavigateToPlaybooks = async () => {
    // Save analysis first if user is logged in
    if (user && analysisData) {
      try {
        const companyName = analysisData.company?.name || 'Unknown Company';
        
        // Check for existing analysis
        const { data: existing } = await supabase
          .from('saved_analyses')
          .select('id')
          .eq('user_id', user.id)
          .eq('company_name', companyName)
          .maybeSingle();

        if (existing) {
          // Update existing record
          await supabase
            .from('saved_analyses')
            .update({ analysis_data: analysisData })
            .eq('id', existing.id);
        } else {
          // Insert new record
          await supabase
            .from('saved_analyses')
            .insert({
              user_id: user.id,
              company_name: companyName,
              analysis_data: analysisData
            });
        }
      } catch (error) {
        console.error('Failed to save before navigation:', error);
        // Continue to navigate even if save fails
      }
    }
    
    // Store analysis in sessionStorage for Playbooks page to pick up
    sessionStorage.setItem('playbookContext', JSON.stringify({
      companyName: analysisData?.company?.name || 'Unknown Company',
      businessContext: analysisData
    }));
    
    // Navigate to Playbooks
    navigate('/playbooks');
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
              <div className="space-y-4">
                <div className="space-y-1 text-center">
                  <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Build Your Business Source of Truth</h2>
                  <p className="text-muted-foreground text-base max-w-3xl mx-auto">
                    Enter a company URL below. Our AI will research public data, analyze business models, and create a comprehensive strategic foundation—ready in 60 seconds.
                  </p>
                </div>
                <ProcessSteps />
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
                setIsNewAnalysis(false);
                setSearchCollapsed(true);
              }}
              className="card-mono card-mono-hover text-left h-36 flex flex-col p-6 group"
            >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <Search className="h-6 w-6 text-primary" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(analysis.created_at).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                      {analysis.company_name}
                    </h3>
                    <span className="text-sm text-primary font-medium whitespace-nowrap ml-4">View analysis</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Results Section */}
        {isLoading && (
          <section className="animate-in fade-in duration-500">
            <LoadingState companyName={analysisData?.company?.name} />
          </section>
        )}

        {hasAnalyzed && !isLoading && analysisData && (
          <div ref={resultsRef} className="space-y-12 animate-in fade-in slide-in-from-bottom duration-500">
            {/* Success Banner - Only show for new analyses */}
            {isNewAnalysis && (
              <SuccessBanner 
                companyName={analysisData.company?.name || "Unknown Company"}
              />
            )}

            {/* Save Button */}
            <div className="w-full max-w-7xl mx-auto mb-6 flex justify-end">
              <Button
                onClick={saveAnalysis}
                disabled={isSaving || !user}
                variant="outline"
                size="default"
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Analysis
                  </>
                )}
              </Button>
            </div>
            
            {/* Inline prompt to scroll if user hasn't scrolled much */}
            {!showPlaybooksCTA && scrollPercentage < 20 && (
              <FloatingCTA 
                show={true}
                onNavigate={() => navigate('/playbooks')}
                variant="inline"
              />
            )}
            
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
                onEditorOpenChange={setBmcEditorOpen}
              />
            </section>

            <section className="w-full max-w-7xl mx-auto">
              <CompetitiveLandscape
                competitors={Array.isArray(analysisData.similarCompanies) ? analysisData.similarCompanies : []} 
                onSimilarCompanyChat={handleSimilarCompanyChat}
              />
            </section>
            
            {/* Floating CTA - hide when BMC editor is open */}
            <FloatingCTA 
              show={showPlaybooksCTA && !bmcEditorOpen}
              onNavigate={handleNavigateToPlaybooks}
              variant="floating"
            />
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
