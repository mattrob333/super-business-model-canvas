import { Loader2 } from "lucide-react";

export const LoadingState = () => {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="card-mono">
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-semibold">Analyzing Business Model</h3>
            <p className="text-muted-foreground text-sm">
              Gathering insights and building your strategic analysis...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
