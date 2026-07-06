import { cn } from "@/lib/utils";

/**
 * The Super BMC brand mark (owner's glyph, 2026-07-06): the nine-block
 * Business Model Canvas silhouette — three pillars, two stacked pairs, the
 * cost/revenue bars — drawn in the brand orange. Fill follows currentColor
 * so surfaces can tint it; default is the primary brand color.
 */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 53 44"
      aria-hidden="true"
      fill="currentColor"
      className={cn("h-6 w-auto shrink-0 text-primary", className)}
    >
      <rect x="0" y="0" width="9" height="28" rx="2" />
      <rect x="11" y="0" width="9" height="13" rx="2" />
      <rect x="11" y="15" width="9" height="13" rx="2" />
      <rect x="22" y="0" width="9" height="28" rx="2" />
      <rect x="33" y="0" width="9" height="13" rx="2" />
      <rect x="33" y="15" width="9" height="13" rx="2" />
      <rect x="44" y="0" width="9" height="28" rx="2" />
      <rect x="0" y="30" width="25.5" height="14" rx="2" />
      <rect x="27.5" y="30" width="25.5" height="14" rx="2" />
    </svg>
  );
}

/**
 * Glyph + Montserrat wordmark. Weight carries the contrast — SUPER is bold,
 * the rest stays light — and the closing dot echoes the orange of the glyph.
 * On tight surfaces the long words collapse away and SUPER. stands alone.
 */
export function BrandMark({
  className,
  iconClassName,
  wordmarkClassName,
}: {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandIcon className={iconClassName} />
      <span
        className={cn(
          "min-w-0 truncate font-montserrat text-sm uppercase leading-none tracking-[0.16em] text-foreground",
          wordmarkClassName,
        )}
      >
        <span className="font-bold">Super</span>
        <span className="hidden font-light sm:inline"> Business Model Canvas</span>
        <span className="font-bold text-primary">.</span>
      </span>
    </span>
  );
}
