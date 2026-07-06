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
        // Tinted panel behind white cards: in light mode the canvas was
        // white-on-white with no depth (owner finding 2026-07-06) — the frame
        // now recedes so the nine sections read as cards ON a board.
        "rounded-xl border-2 border-border bg-muted/40 shadow-sm p-3 sm:p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 md:gap-2">{children}</div>
    </div>
  );
}
