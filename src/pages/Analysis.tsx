import { useState, useEffect } from "react";
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
import { Copy, Check, Save, LogOut, User, Shield, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { toast } = useToast();

  // Load saved analysis from sessionStorage if available
  useEffect(() => {
    const loadedAnalysis = sessionStorage.getItem('loadedAnalysis');
    if (loadedAnalysis) {
      try {
        setAnalysisData(JSON.parse(loadedAnalysis));
        setHasAnalyzed(true);
        sessionStorage.removeItem('loadedAnalysis');
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

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You've been signed out successfully",
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/[0.12] backdrop-blur-sm sticky top-0 z-30 bg-background/80">
        <div className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-start md:items-center justify-between gap-3">
            {/* Logo - Mobile: Stacked, Desktop: Horizontal */}
            <div className="flex-1">
              <div className="hidden md:flex items-center gap-1.5">
                <div className="inline-flex items-center bg-[#C4F82A] text-black px-3 py-1 rounded-full font-montserrat font-normal tracking-wide">
                  <span className="text-xl">SUPER</span>
                </div>
                <h1 className="text-xl font-montserrat font-light tracking-wide text-white">BUSINESS MODEL CANVAS</h1>
              </div>
              
              {/* Mobile Logo - Stacked */}
              <div className="md:hidden flex flex-col gap-0.5">
                <div className="inline-flex items-center bg-[#C4F82A] text-black px-2.5 py-0.5 rounded-full font-montserrat font-normal tracking-wide w-fit">
                  <span className="text-sm">SUPER</span>
                </div>
                <div className="font-montserrat font-light tracking-wide text-white text-sm leading-tight pl-2.5">
                  <div>BUSINESS MODEL</div>
                  <div>CANVAS</div>
                </div>
              </div>
            </div>

            {/* Right Side Controls */}
            <div className="flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-3">
              {/* Action Buttons - Desktop */}
              <div className="hidden md:flex items-center gap-3">
                {hasAnalyzed && !isLoading && analysisData && (
                  <>
                    <Button 
                      onClick={saveAnalysis}
                      variant="outline" 
                      size="sm"
                      className="gap-2 h-9 text-sm"
                      disabled={isSaving}
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button 
                      onClick={copyToMarkdown}
                      variant="outline" 
                      size="sm"
                      className="gap-2 h-9 text-sm"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </>
                )}
                
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 bg-white/[0.08] hover:bg-white/[0.12]">
                        <User className="h-4 w-4" />
                        <span>{user.email?.split('@')[0] || 'Account'}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => navigate('/my-analyses')}>
                        My Analyses
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => navigate('/admin')}>
                          <Shield className="mr-2 h-4 w-4" />
                          Admin Dashboard
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate('/auth')}
                  >
                    Sign In
                  </Button>
                )}
                
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
                  <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                  <span className="label-tech text-primary text-[10px]">Powered by AI</span>
                </div>
              </div>

              {/* Mobile Controls */}
              <div className="md:hidden flex flex-col items-end gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-full">
                  <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                  <span className="label-tech text-primary text-[8px] whitespace-nowrap">POWERED BY AI</span>
                </div>
                
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 bg-white/[0.08] hover:bg-white/[0.12]">
                        <User className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => navigate('/my-analyses')}>
                        My Analyses
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem onClick={() => navigate('/admin')}>
                          <Shield className="mr-2 h-4 w-4" />
                          Admin Dashboard
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-8"
                    onClick={() => navigate('/auth')}
                  >
                    Sign In
                  </Button>
                )}
                
                {hasAnalyzed && !isLoading && analysisData && (
                  <div className="flex items-center gap-2">
                    <Button 
                      onClick={saveAnalysis}
                      variant="outline" 
                      size="sm"
                      className="gap-2 h-8 text-xs"
                      disabled={isSaving}
                    >
                      <Save className="h-3 w-3" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button 
                      onClick={copyToMarkdown}
                      variant="outline" 
                      size="sm"
                      className="gap-2 h-8 text-xs"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tagline */}
      <div className="bg-background">
        <div className="container mx-auto px-4 md:px-6 pt-6 pb-6">
          <p className="text-muted-foreground font-montserrat font-light text-sm md:text-base tracking-wide">
            AI-Powered Strategic Business Analysis
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 space-y-16">
        {/* Input Section */}
        <section className="pt-2 md:pt-8">
          <div className="w-full max-w-7xl mx-auto">
            <div className="space-y-6">
              <div className="space-y-1">
                <span className="label-tech text-muted-foreground">Company Analysis</span>
                <h2 className="text-3xl font-semibold tracking-tight">Get Started</h2>
                <p className="text-muted-foreground text-sm">Enter a company URL to generate comprehensive business insights</p>
              </div>
              <UrlInput onAnalyze={handleAnalyze} isLoading={isLoading} />
            </div>
          </div>
        </section>

        {/* Quick Access Section */}
        {!hasAnalyzed && !isLoading && (
          <section className="w-full max-w-7xl mx-auto">
            <h2 className="text-2xl font-semibold text-white mb-8">
              {recentAnalyses.length > 0 ? 'Recent Analyses' : 'Quick Start'}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentAnalyses.length > 0 ? (
                // Show recent analyses
                recentAnalyses.map((analysis) => (
                  <button
                    key={analysis.id}
                    onClick={() => {
                      setAnalysisData(analysis.analysis_data);
                      setHasAnalyzed(true);
                    }}
                    className="card-mono card-mono-hover text-left h-36 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                        {analysis.company_name}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">View analysis</p>
                  </button>
                ))
              ) : (
                // Show example companies for new users
                <>
                  <button
                    onClick={() => handleAnalyze('https://www.tesla.com')}
                    className="card-mono card-mono-hover text-left h-36 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                        Analyze Tesla
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Electric vehicles & energy</p>
                  </button>
                  
                  <button
                    onClick={() => handleAnalyze('https://www.nike.com')}
                    className="card-mono card-mono-hover text-left h-36 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                        Analyze Nike
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Athletic footwear & apparel</p>
                  </button>
                  
                  <button
                    onClick={() => handleAnalyze('https://www.starbucks.com')}
                    className="card-mono card-mono-hover text-left h-36 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
                        Analyze Starbucks
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">Coffee & beverages</p>
                  </button>
                </>
              )}
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
                  website: analysisData.company?.website || "",
                  notes: analysisData.company?.notes
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
            </section>

            <section>
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
