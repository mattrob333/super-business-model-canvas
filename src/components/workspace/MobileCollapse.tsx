import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Below md a room's supporting panels fold behind slim summary rows so the
 * conversation leads (the mobile room was five panels of preamble before the
 * chat). Desktop renders children untouched. Shared by the section rooms and
 * the War Room — one mobile behavior for every room.
 */
export function MobileCollapse({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  if (!isMobile) return <>{children}</>;
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-sm [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
