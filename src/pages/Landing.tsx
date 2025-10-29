import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, BarChart3, Lightbulb, Zap, MessageSquare, RefreshCw } from "lucide-react";

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
            <div className="flex flex-col sm:flex-row items-center sm:gap-1.5 gap-2">
              <div className="inline-flex items-center bg-[#C4F82A] text-black px-3 py-1 rounded-full font-montserrat font-normal tracking-wide">
                <span className="text-lg sm:text-xl">SUPER</span>
              </div>
              <h1 className="text-lg sm:text-xl font-montserrat font-light tracking-wide text-white">
                <span className="md:hidden">BMC</span>
                <span className="hidden md:inline">BUSINESS MODEL CANVAS</span>
              </h1>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary/10 border border-primary/20 rounded-full">
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
            
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              Build Your Business<br />
              <span className="text-primary">Source of Truth</span>
            </h2>
            
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              AI generates your complete business context in 60 seconds. 
              Refine it with AI assistance. Use it as your strategic foundation.
            </p>

            {/* 3-Step Process */}
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-center gap-4 md:gap-8">
                {/* Step 1 */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center font-semibold text-sm">
                    1
                  </div>
                  <h3 className="text-base font-semibold text-white">AI Builds</h3>
                  <p className="text-sm text-muted-foreground">60 seconds</p>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block" />

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center font-semibold text-sm">
                    2
                  </div>
                  <h3 className="text-base font-semibold text-white">You Refine</h3>
                  <p className="text-sm text-muted-foreground">With AI assistance</p>
                </div>

                {/* Arrow */}
                <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 hidden sm:block" />

                {/* Step 3 */}
                <div className="flex flex-col items-center gap-2 flex-1">
                  <div className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center font-semibold text-sm">
                    3
                  </div>
                  <h3 className="text-base font-semibold text-white">Reuse Forever</h3>
                  <p className="text-sm text-muted-foreground">As foundation</p>
                </div>
              </div>
            </div>

            {/* Email Signup Form */}
            <form onSubmit={handleSubmit} className="max-w-md mx-auto mt-8 sm:mt-12 px-4 sm:px-0">
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
                AI generates all 9 building blocks of your Business Model Canvas instantly from any company URL.
              </p>
            </div>

            <div className="card-mono card-mono-hover space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">AI-Powered</h3>
              <p className="text-muted-foreground leading-relaxed">
                Refine each section with embedded AI chat until your context file is perfect and accurate.
              </p>
            </div>

            <div className="card-mono card-mono-hover space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
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
