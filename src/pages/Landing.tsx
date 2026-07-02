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
      setTimeout(() => navigate("/canvas"), 1500);
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
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-30 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-row items-center gap-2">
              <div className="inline-flex items-center bg-primary text-primary-foreground px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-md font-semibold tracking-wide">
                <span className="text-base sm:text-lg whitespace-nowrap">SUPER</span>
              </div>
              <h1 className="text-base sm:text-lg font-medium tracking-wide text-foreground whitespace-nowrap">
                <span className="md:hidden">BMC</span>
                <span className="hidden md:inline">Business Model Canvas</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
                <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                <span className="text-primary text-xs font-medium tracking-wide">Powered by AI</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                Sign in
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative">
        <div className="container mx-auto px-6 py-16 sm:py-24 max-w-5xl">
          {/* Main Hero Content */}
          <div className="text-center space-y-8 mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-primary text-xs font-medium tracking-wide">AI Strategic Analysis</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-tight">
              Build Your Business<br />
              <span className="text-primary">Source of Truth</span>
            </h2>
            
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              AI generates your complete business context in 60 seconds. 
              Refine it with AI assistance. Use it as your strategic foundation.
            </p>

            {/* 3-Step Process */}
            <div className="max-w-2xl mx-auto">
              <div className="flex items-start justify-center gap-3 sm:gap-6 md:gap-8">
                {/* Step 1 */}
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-base sm:text-lg flex-shrink-0">
                    1
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground text-center">AI Builds</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">60 seconds</p>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0 mt-3 sm:mt-4" />

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-base sm:text-lg flex-shrink-0">
                    2
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground text-center">You Refine</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">With AI assistance</p>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0 mt-3 sm:mt-4" />

                {/* Step 3 */}
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-base sm:text-lg flex-shrink-0">
                    3
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground text-center">Reuse Forever</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center">As foundation</p>
                </div>
              </div>
            </div>

            {/* Email Signup Form */}
            <form onSubmit={handleSubmit} className="max-w-5xl mx-auto mt-8 sm:mt-12 px-4 sm:px-0">
              <div className="bg-card border border-border rounded-xl p-6 sm:p-8 space-y-4 max-w-md mx-auto">
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
                    className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                  >
                    Already have an account? Sign in
                  </a>
                </div>
              </div>
            </form>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 mt-24">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4 hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Complete BMC</h3>
              <p className="text-muted-foreground leading-relaxed">
                AI generates all 9 building blocks of your Business Model Canvas instantly from any company URL.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4 hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">AI-Powered</h3>
              <p className="text-muted-foreground leading-relaxed">
                Refine each section with embedded AI chat until your context file is perfect and accurate.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4 hover:border-primary/30 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Reusable Foundation</h3>
              <p className="text-muted-foreground leading-relaxed">
                Save your context file and use it to run 70+ strategic frameworks—build once, use forever.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-24">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>© 2025 Super Business Model Canvas</p>
            <p className="text-xs tracking-wide">Strategic Analysis Tool</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
