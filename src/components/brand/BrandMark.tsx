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
 * The outlined canvas glyph (owner's logo refresh, 2026-07-06): the same
 * nine-block silhouette drawn as a stroked grid — rounded outer frame, five
 * columns with the second and fourth split, cost/revenue bar below. Stroke
 * follows currentColor; default is the brand orange.
 */
export function BrandOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 36"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className={cn("h-8 w-auto shrink-0 text-primary", className)}
    >
      <rect x="1.5" y="1.5" width="53" height="33" rx="4" />
      <path d="M12.1 1.5v23M22.7 1.5v23M33.3 1.5v23M43.9 1.5v23" />
      <path d="M12.1 13h10.6M33.3 13h10.6" />
      <path d="M1.5 24.5h53" />
      <path d="M28 24.5v10" />
    </svg>
  );
}

/**
 * The stacked lockup from the owner's 2026-07-06 logo files: outlined glyph
 * beside SUPER (orange, wide-tracked) over BMC (deep navy in light mode,
 * white in dark — matching the supplied light/dark variants).
 */
export function BrandLogo({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandOutlineIcon className={iconClassName} />
      <span className="flex min-w-0 flex-col font-montserrat font-extrabold uppercase leading-none">
        <span className="text-[11px] tracking-[0.34em] text-primary">Super</span>
        <span className="mt-0.5 text-lg tracking-[0.1em] text-[#0e142a] dark:text-white">BMC</span>
      </span>
    </span>
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
