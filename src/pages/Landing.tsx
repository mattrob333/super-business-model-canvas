import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, BarChart3, Lightbulb } from "lucide-react";

const Landing = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("leads")
        .insert([{ email }]);

      if (error) {
        if (error.code === "23505") { // Unique constraint violation
          toast({
            title: "Already Registered",
            description: "This email is already signed up. Redirecting you to the tool...",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Success!",
          description: "You're all set. Redirecting to the analysis tool...",
        });
      }

      // Redirect to analysis tool
      setTimeout(() => navigate("/analyze"), 1500);
    } catch (error: any) {
      console.error("Error submitting email:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background gradient effect */}
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.12] backdrop-blur-sm sticky top-0 z-30 bg-background/80">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center bg-[#C4F82A] text-black px-4 py-1.5 rounded-full font-montserrat font-light tracking-wide">
                <span className="text-base">SUPER</span>
              </div>
              <h1 className="text-xl font-montserrat font-light tracking-wide text-white">BUSINESS MODEL CANVAS</h1>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              <span className="label-tech text-primary text-[10px]">Powered by AI</span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative">
        <div className="container mx-auto px-6 py-24 max-w-5xl">
          {/* Main Hero Content */}
          <div className="text-center space-y-8 mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/[0.12] rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="label-tech text-primary text-[10px]">AI Strategic Analysis</span>
            </div>
            
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-tight">
              Analyze Any Business<br />
              <span className="text-primary">In Seconds</span>
            </h2>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Turn any company URL into a complete Business Model Canvas. Get strategic insights, 
              competitive analysis, and market positioning—powered by AI.
            </p>

            {/* Email Signup Form */}
            <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-12">
              <div className="card-mono p-6 space-y-4">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-base"
                  disabled={isSubmitting}
                />
                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full h-12 text-base"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Get Started Free"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <p className="text-xs text-muted-foreground">
                  No credit card required. Instant access.
                </p>
                <div className="text-center">
                  <a 
                    href="/auth" 
                    className="text-sm text-primary hover:underline"
                  >
                    Already have an account? Sign in
                  </a>
                </div>
              </div>
            </form>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-24">
            <div className="card-mono card-mono-hover space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Complete BMC</h3>
              <p className="text-muted-foreground leading-relaxed">
                Generate a full Business Model Canvas with all 9 building blocks analyzed and mapped out.
              </p>
            </div>

            <div className="card-mono card-mono-hover space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">AI-Powered</h3>
              <p className="text-muted-foreground leading-relaxed">
                Leverage advanced AI to analyze company websites, extract key insights, and identify patterns.
              </p>
            </div>

            <div className="card-mono card-mono-hover space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Strategic Insights</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get competitive landscape analysis, market positioning, and actionable strategic recommendations.
              </p>
            </div>
          </div>
        </div>
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
    </div>
  );
};

export default Landing;
