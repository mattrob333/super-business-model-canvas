import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Copy, Download, Save, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { copyHtmlToClipboard, exportReportToPdf } from "@/lib/report-export";
import { REPORT_TEMPLATES } from "@/data/report-templates";
import { Skeleton } from "@/components/ui/skeleton";

interface ReportViewerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string | null;
  frameworkId: string;
  companyId: string;
  companyName: string;
  onRegenerate?: () => void;
}

export function ReportViewerDrawer({
  isOpen,
  onClose,
  reportId,
  frameworkId,
  companyId,
  companyName,
  onRegenerate
}: ReportViewerDrawerProps) {
  const [reportHtml, setReportHtml] = useState<string>("");
  const [originalHtml, setOriginalHtml] = useState<string>("");
  const [isEdited, setIsEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [frameworkTitle, setFrameworkTitle] = useState("");
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
      .select('*, strategic_frameworks(title)')
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
      setFrameworkTitle(data.strategic_frameworks?.title || "Strategic Report");
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
      await copyHtmlToClipboard(reportHtml);
      toast({
        title: "Copied",
        description: "HTML copied to clipboard"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy HTML",
        variant: "destructive"
      });
    }
  };

  const handleExportPdf = () => {
    const filename = `${companyName}-${frameworkId}-report.pdf`;
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

  const template = REPORT_TEMPLATES[frameworkId];
  const styles = template?.cssStyles || "";

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:w-[1100px] sm:max-w-[1100px] xl:w-[1200px] xl:max-w-[1200px] overflow-y-auto p-0 flex flex-col">
        {/* Sticky Header with Actions */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xl font-bold">{frameworkTitle}</div>
              <div className="text-sm font-normal text-muted-foreground mt-1">{companyName}</div>
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
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              <style>{styles}</style>
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
