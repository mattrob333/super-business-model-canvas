import { useState } from "react";
import {
  Briefcase,
  User,
  MessageSquare,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BusinessOverviewEditor } from "@/components/BusinessOverviewEditor";

interface KeyExecutive {
  name: string;
  role: string;
}

export interface BusinessOverviewData {
  name: string;
  industry: string;
  description: string;
  productsServices: string[];
  keyExecutives: KeyExecutive[];
  website: string;
  notes?: string;
}

interface BusinessOverviewSheetProps {
  data: BusinessOverviewData;
  onUpdate?: (data: BusinessOverviewData) => void;
}

/** Subtle trigger + slide-over wiki-style company profile */
export function BusinessOverviewSheet({
  data,
  onUpdate,
}: BusinessOverviewSheetProps) {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const handleSave = (updated: BusinessOverviewData) => {
    onUpdate?.(updated);
    setEditorOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>Business overview</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-xl">{data.name}</SheetTitle>
            <SheetDescription className="text-sm font-medium text-primary">
              {data.industry}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                About
              </h3>
              <p className="text-sm leading-relaxed text-foreground/90">
                {data.description}
              </p>
            </section>

            {data.website && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Website
                </h3>
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  {data.website.replace(/^https?:\/\/(www\.)?/, "")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </section>
            )}

            {data.productsServices.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Products &amp; services
                </h3>
                <ul className="space-y-2">
                  {data.productsServices.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-foreground/85"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.keyExecutives.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Key leadership
                </h3>
                <ul className="space-y-3">
                  {data.keyExecutives.map((exec, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{exec.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {exec.role}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                AI-drafted — review and refine for accuracy
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setEditorOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              Refine with AI
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BusinessOverviewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        data={data}
        onSave={handleSave}
        companyName={data.name}
      />
    </>
  );
}
