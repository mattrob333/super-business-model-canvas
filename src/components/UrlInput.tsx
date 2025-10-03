import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
}

export const UrlInput = ({ onAnalyze, isLoading }: UrlInputProps) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url);
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
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
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
