import { MessageCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FloatingChatButtonProps {
  messageCount: number;
  companyName: string;
  onClick: () => void;
  hasNewRecommendations?: boolean;
}

export const FloatingChatButton = ({
  messageCount,
  companyName,
  onClick,
  hasNewRecommendations = false,
}: FloatingChatButtonProps) => {
  return (
    <Button
      onClick={onClick}
      className={`fixed right-6 bottom-6 h-auto flex-col gap-2 p-4 shadow-2xl hover:shadow-primary/20 transition-all duration-300 hover:scale-105 z-40 ${
        hasNewRecommendations ? "animate-pulse" : ""
      }`}
      size="lg"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <MessageCircle className="h-5 w-5" />
          {messageCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
            >
              {messageCount}
            </Badge>
          )}
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span className="text-xs font-semibold">Strategy Coach</span>
          </div>
          <span className="text-[10px] opacity-80">{companyName}</span>
        </div>
      </div>
      {hasNewRecommendations && (
        <span className="text-[10px] font-medium">New recommendations</span>
      )}
    </Button>
  );
};
