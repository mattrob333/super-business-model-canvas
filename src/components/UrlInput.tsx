import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
}

// URL validation schema
const urlSchema = z.string()
  .trim()
  .min(3, "URL is too short")
  .max(500, "URL is too long")
  .refine((val) => {
    // Remove common prefixes for validation
    const cleaned = val.replace(/^(https?:\/\/)?(www\.)?/i, '');
    // Check if it looks like a domain (contains at least one dot and valid characters)
    return /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/i.test(cleaned);
  }, "Please enter a valid domain (e.g., example.com)");

// Normalize URL by adding protocol if missing
const normalizeUrl = (input: string): string => {
  let normalized = input.trim();
  
  // If it doesn't start with http:// or https://, add https://www.
  if (!/^https?:\/\//i.test(normalized)) {
    // Check if it already has www.
    if (!/^www\./i.test(normalized)) {
      normalized = 'https://www.' + normalized;
    } else {
      normalized = 'https://' + normalized;
    }
  }
  
  return normalized;
};

export const UrlInput = ({ onAnalyze, isLoading }: UrlInputProps) => {
  const [url, setUrl] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a company URL",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate the URL
      urlSchema.parse(url);
      
      // Normalize and send
      const normalizedUrl = normalizeUrl(url);
      onAnalyze(normalizedUrl);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Invalid URL",
          description: error.errors[0]?.message || "Please enter a valid URL",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="card-mono">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="label-tech text-muted-foreground">
              Company URL
            </label>
            <p className="text-foreground/80 text-sm">
              Enter any business website to generate an AI-powered strategic analysis
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="flex gap-4">
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="example.com or https://example.com"
              className="flex-1 h-14 px-6 text-lg bg-white/[0.05] border-white/[0.12] focus:border-primary"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="h-14 px-8 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full font-semibold uppercase tracking-tech transition-all hover:scale-105"
            >
              <Search className="mr-2 h-5 w-5" />
              {isLoading ? "Analyzing..." : "Analyze"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
