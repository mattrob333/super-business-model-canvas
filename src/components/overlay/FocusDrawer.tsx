import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MessageSquare, PanelRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * FocusDrawer — the app's ONE standard overlay for reading/working on a
 * focused thing (spec 09). Right-anchored, portaled, focus-trapped, Escape
 * closes, opens scrolled to top with autofocus suppressed.
 *
 * Hard rules (spec 09 §2): a drawer never opens another drawer — mode changes
 * swap content inside; the optional AI rail is the only conversation surface;
 * sizes are named, never per-callsite widths.
 */

export type FocusDrawerSize = "peek" | "reading" | "focus";

const SIZE_CLASSES: Record<FocusDrawerSize, string> = {
  peek: "w-full sm:w-[420px]",
  reading: "w-full sm:w-[min(92vw,720px)]",
  focus: "w-full md:w-[88vw] lg:w-[72vw] md:max-w-[1240px]",
};

export interface FocusDrawerRail {
  header: React.ReactNode;
  content: React.ReactNode;
  footer?: React.ReactNode;
  /** Mobile toggle label. Default "Assistant". */
  mobileLabel?: string;
}

export interface FocusDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: FocusDrawerSize;
  /** Content-type label, e.g. "BUSINESS OVERVIEW". */
  eyebrow?: string;
  /** Accessible dialog name. */
  title: string;
  subtitle?: string;
  /** Buttons rendered left of the close X. */
  headerActions?: React.ReactNode;
  /** Fixed bar under the body (e.g. Save). */
  footer?: React.ReactNode;
  /** Optional right AI rail — single instance, toggled (not duplicated) on mobile. */
  rail?: FocusDrawerRail;
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string;
  children: React.ReactNode;
}

export function FocusDrawer({
  open,
  onOpenChange,
  size = "focus",
  eyebrow,
  title,
  subtitle,
  headerActions,
  footer,
  rail,
  bodyClassName,
  children,
}: FocusDrawerProps) {
  const bodyRef = React.useRef<HTMLDivElement>(null);
  // On small screens with a rail, one region shows at a time — same DOM nodes.
  const [mobileView, setMobileView] = React.useState<"body" | "rail">("body");

  React.useEffect(() => {
    if (open) {
      setMobileView("body");
      // Open at the top, every time (spec 09 §2.3).
      requestAnimationFrame(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
      });
    }
  }, [open]);

  const hasRail = Boolean(rail);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            "motion-reduce:animate-none",
          )}
        />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l border-border bg-card shadow-lg outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-200",
            "motion-reduce:animate-none",
            SIZE_CLASSES[size],
          )}
        >
          {/* Header band */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
              )}
              <DialogPrimitive.Title className="truncate text-lg font-semibold tracking-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              {subtitle ? (
                <DialogPrimitive.Description className="truncate text-xs text-muted-foreground">
                  {subtitle}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>

            {/* Mobile body/rail toggle — same nodes, visibility only */}
            {hasRail && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 md:hidden"
                onClick={() => setMobileView((v) => (v === "body" ? "rail" : "body"))}
              >
                {mobileView === "body" ? (
                  <>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {rail?.mobileLabel ?? "Assistant"}
                  </>
                ) : (
                  <>
                    <PanelRight className="h-3.5 w-3.5" />
                    Details
                  </>
                )}
              </Button>
            )}

            {headerActions}

            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Body + optional rail */}
          <div className="flex min-h-0 flex-1">
            <div
              className={cn(
                "min-w-0 flex-1 flex-col",
                hasRail && mobileView === "rail" ? "hidden md:flex" : "flex",
              )}
            >
              <div ref={bodyRef} className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
                {children}
              </div>
              {footer && (
                <div className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6">{footer}</div>
              )}
            </div>

            {rail && (
              <div
                className={cn(
                  "w-full flex-col border-border md:w-[40%] md:min-w-[320px] md:max-w-[460px] md:border-l",
                  mobileView === "rail" ? "flex" : "hidden md:flex",
                )}
              >
                <div className="shrink-0 border-b border-border px-4 py-3">{rail.header}</div>
                <div className="min-h-0 flex-1">{rail.content}</div>
                {rail.footer && (
                  <div className="shrink-0 border-t border-border px-4 py-3">{rail.footer}</div>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
