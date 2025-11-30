import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Copy, Download, Save, RefreshCw, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { copyHtmlToClipboard, exportReportToPdf } from "@/lib/report-export";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface ReportViewerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string | null;
  frameworkId?: string;
  companyId?: string;
  companyName?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
}

export function ReportViewerDrawer({
  isOpen,
  onClose,
  reportId,
  frameworkId,
  companyId,
  companyName,
  onRegenerate,
  isGenerating = false
}: ReportViewerDrawerProps) {
  const [reportHtml, setReportHtml] = useState<string>("");
  const [originalHtml, setOriginalHtml] = useState<string>("");
  const [isEdited, setIsEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [frameworkTitle, setFrameworkTitle] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [loadedCompanyName, setLoadedCompanyName] = useState("");
  const [loadedFrameworkId, setLoadedFrameworkId] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reportId && isOpen) {
      fetchReport();
    }
  }, [reportId, isOpen]);

  const fetchReport = async () => {
    if (!reportId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('generated_reports')
      .select('*, frameworks(title, custom_css)')
      .eq('id', reportId)
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load report",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    if (data) {
      setReportHtml(data.report_content);
      setOriginalHtml(data.original_content || data.report_content);
      setIsEdited(data.is_edited || false);
      setFrameworkTitle(data.frameworks?.title || "Strategic Report");
      setCustomCss(data.frameworks?.custom_css || "");
      setLoadedCompanyName(data.company_name || "");
      setLoadedFrameworkId(data.framework_id || "");
    }
    
    setIsLoading(false);
  };

  const handleContentChange = () => {
    if (contentRef.current) {
      const currentHtml = contentRef.current.innerHTML;
      setReportHtml(currentHtml);
      setIsEdited(currentHtml !== originalHtml);
    }
  };

  // Wire up the "Copy JSON" button for Org Chart reports and protect the JSON block from edits
  useEffect(() => {
    if (!isOpen || !contentRef.current) return;

    const root = contentRef.current;

    // Make JSON section non-editable even though the whole report wrapper is contentEditable
    const jsonSections = root.querySelectorAll<HTMLElement>(".json-section");
    jsonSections.forEach((section) => {
      section.setAttribute("contenteditable", "false");
    });

    const jsonCode = root.querySelector<HTMLElement>("#json-data");
    if (jsonCode) {
      jsonCode.setAttribute("contenteditable", "false");
    }

    const jsonPre = root.querySelector<HTMLElement>(".json-output");
    if (jsonPre) {
      jsonPre.setAttribute("contenteditable", "false");
    }

    const button = root.querySelector<HTMLButtonElement>(".copy-btn");
    if (!button) return;

    // Remove any inline onclick handler from the template since scripts don't execute in this context
    button.removeAttribute("onclick");

    const handleCopyClick = async (event: Event) => {
      event.preventDefault();
      event.stopPropagation();

      const jsonElement = root.querySelector<HTMLElement>("#json-data");
      if (!jsonElement) return;

      const jsonText = jsonElement.textContent || "";

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(jsonText);
          button.textContent = "✓ Copied!";
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = jsonText;
          textArea.style.position = "fixed";
          textArea.style.left = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();

          try {
            document.execCommand("copy");
            button.textContent = "✓ Copied!";
          } catch (err) {
            console.error("Fallback copy failed:", err);
            button.textContent = "❌ Failed";
          }

          document.body.removeChild(textArea);
        }

        setTimeout(() => {
          button.textContent = "📋 Copy JSON";
        }, 2000);
      } catch (err) {
        console.error("Copy failed:", err);
        button.textContent = "❌ Failed";
        setTimeout(() => {
          button.textContent = "📋 Copy JSON";
        }, 2000);
      }
    };

    button.addEventListener("click", handleCopyClick);

    return () => {
      button.removeEventListener("click", handleCopyClick);
    };
  }, [isOpen, reportHtml]);

  const handleSaveChanges = async () => {
    if (!reportId) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from('generated_reports')
      .update({
        report_content: reportHtml,
        is_edited: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      });
    } else {
      setOriginalHtml(reportHtml);
      setIsEdited(false);
      toast({
        title: "Saved",
        description: "Report changes saved successfully"
      });
    }
    
    setIsSaving(false);
  };

  const handleCopyHtml = async () => {
    try {
      let textToCopy = reportHtml;

      // Prefer copying the visible text version so it works well when pasting into other apps
      if (contentRef.current) {
        textToCopy = contentRef.current.innerText;
      }

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      toast({
        title: "Copied",
        description: "Content copied to clipboard as text",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy content",
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = () => {
    const effectiveCompanyName = companyName || loadedCompanyName || "company";
    const effectiveFrameworkId = frameworkId || loadedFrameworkId || "report";
    const filename = `${effectiveCompanyName}-${effectiveFrameworkId}-report.pdf`;
    exportReportToPdf(reportHtml, filename);
    toast({
      title: "Exporting",
      description: "Your PDF is being generated"
    });
  };

  const handleClose = () => {
    if (isEdited) {
      if (confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:w-[1100px] sm:max-w-[1100px] xl:w-[1200px] xl:max-w-[1200px] overflow-y-auto p-0 flex flex-col">
        {/* Sticky Header with Actions */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xl font-bold">{frameworkTitle}</div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                {companyName || loadedCompanyName}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyHtml}
              disabled={isLoading}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy HTML
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isLoading}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>

            {isEdited && (
              <Button
                size="sm"
                onClick={handleSaveChanges}
                disabled={isSaving || isLoading}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}

            {onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={isLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Regenerate
              </Button>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-background">
          {isGenerating && !reportId ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center space-y-6 max-w-md">
                <Loader2 className="h-16 w-16 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">Generating Your Strategic Report</h3>
                  <p className="text-muted-foreground">
                    Analyzing business context and applying strategic frameworks...
                  </p>
                </div>
                <Progress value={33} className="w-full" />
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <style>{customCss}</style>
              <div
                ref={contentRef}
                contentEditable
                onInput={handleContentChange}
                className="min-h-[400px] focus:outline-none prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: reportHtml }}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
