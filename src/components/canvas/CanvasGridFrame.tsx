import { cn } from "@/lib/utils";

interface CanvasGridFrameProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Outer frame around the full 9-section BMC grid so the canvas reads as
 * one cohesive unit (traditional canvas "poster" layout).
 */
export function CanvasGridFrame({ children, className }: CanvasGridFrameProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/25 p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 md:gap-2">{children}</div>
    </div>
  );
}
