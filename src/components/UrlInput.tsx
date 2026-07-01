import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { LoadingState } from "@/components/LoadingState";

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  companyName?: string;
}

const urlSchema = z
  .string()
  .trim()
  .min(3, "URL is too short")
  .max(500, "URL is too long")
  .refine((val) => {
    const cleaned = val
      .replace(/^(https?:\/\/)?(www\.)?/i, "")
      .replace(/\/.*$/, "");
    return /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/i.test(cleaned);
  }, "Please enter a valid domain (e.g., example.com)");

const normalizeUrl = (input: string): string => {
  let normalized = input.trim();

  if (!/^https?:\/\//i.test(normalized)) {
    if (!/^www\./i.test(normalized)) {
      normalized = "https://www." + normalized;
    } else {
      normalized = "https://" + normalized;
    }
  }

  return normalized;
};

export function UrlInput({ onAnalyze, isLoading, companyName }: UrlInputProps) {
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
      urlSchema.parse(url);
      onAnalyze(normalizeUrl(url));
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
    <div className="w-full">
      <div className="rounded-xl border border-border bg-card shadow-sm transition-shadow duration-300 focus-within:border-primary/30 focus-within:shadow-md">
        <div className="p-5 sm:p-6">
          {isLoading ? (
            <LoadingState embedded companyName={companyName} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="company-url"
                  className="text-sm font-medium text-foreground"
                >
                  Company website
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="company-url"
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="salesforce.com"
                    className="h-11 flex-1 text-base"
                    disabled={isLoading}
                    autoFocus
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || !url.trim()}
                    className="h-11 shrink-0 gap-2 px-5 sm:min-w-[160px]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Building…
                      </>
                    ) : (
                      <>
                        Generate
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Works with any company — your own, a competitor, or a client.
                AI uses public sources only; you refine everything afterward.
              </p>
            </form>
          )}
        </div>
      </div>

      {!isLoading && (
        <p className="mt-3 text-center text-xs text-muted-foreground/70">
          Press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Enter
          </kbd>{" "}
          to start · Your first context takes about a minute
        </p>
      )}
    </div>
  );
}
