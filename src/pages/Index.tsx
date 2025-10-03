import { useState } from "react";
import { UrlInput } from "@/components/UrlInput";
import { LoadingState } from "@/components/LoadingState";
import { BusinessOverview } from "@/components/BusinessOverview";
import { BusinessModelCanvas } from "@/components/BusinessModelCanvas";
import { CompetitiveLandscape } from "@/components/CompetitiveLandscape";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

// Mock data for demonstration
const mockData = {
  overview: {
    name: "Shopify Inc.",
    description: "Shopify is a leading global commerce company providing essential internet infrastructure for commerce, offering trusted tools to start, grow, market, and manage a retail business of any size.",
    productsServices: [
      "E-commerce Platform",
      "Point of Sale System",
      "Payment Processing",
      "Marketing Tools",
      "Analytics & Reporting",
      "Multi-channel Selling"
    ],
    founded: "2006",
    headquarters: "Ottawa, Canada",
    employees: "10,000+",
    revenue: "$5.6B (2023)"
  },
  canvas: {
    keyPartners: [
      "Payment processors",
      "Shipping carriers",
      "App developers",
      "Theme designers",
      "Marketing agencies"
    ],
    keyActivities: [
      "Platform development",
      "Customer support",
      "Partner ecosystem management",
      "Marketing and sales"
    ],
    keyResources: [
      "Technology infrastructure",
      "Developer community",
      "Brand reputation",
      "Data and analytics"
    ],
    valuePropositions: [
      "Easy-to-use e-commerce platform",
      "Scalable infrastructure",
      "Comprehensive toolkit",
      "Multi-channel selling",
      "Strong app ecosystem"
    ],
    customerRelationships: [
      "Self-service platform",
      "24/7 customer support",
      "Community forums",
      "Educational resources"
    ],
    channels: [
      "Direct website",
      "Partner network",
      "App marketplace",
      "Social media",
      "Events and conferences"
    ],
    customerSegments: [
      "Small businesses",
      "Growing retailers",
      "Enterprise brands",
      "Direct-to-consumer brands",
      "Multi-channel merchants"
    ],
    costStructure: [
      "Technology infrastructure",
      "R&D and engineering",
      "Sales and marketing",
      "Customer support",
      "Payment processing fees"
    ],
    revenueStreams: [
      "Subscription fees (monthly/annual)",
      "Transaction fees",
      "Payment processing fees",
      "App and theme sales (revenue share)",
      "Shopify Plus (enterprise)"
    ]
  },
  competitors: [
    {
      name: "WooCommerce",
      description: "Open-source e-commerce plugin for WordPress, offering flexibility and customization for online stores.",
      website: "https://woocommerce.com"
    },
    {
      name: "BigCommerce",
      description: "SaaS e-commerce platform providing enterprise-grade features for growing and established businesses.",
      website: "https://bigcommerce.com"
    },
    {
      name: "Wix eCommerce",
      description: "Website builder with integrated e-commerce capabilities, focusing on ease of use and design.",
      website: "https://wix.com"
    }
  ]
};

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/[0.12] backdrop-blur-sm sticky top-0 z-30 bg-background/80">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Super Business Model Canvas</h1>
              <p className="text-sm text-muted-foreground">AI-Powered Strategic Analysis</p>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              <span className="label-tech text-primary text-[10px]">Powered by AI</span>
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

export default Index;
