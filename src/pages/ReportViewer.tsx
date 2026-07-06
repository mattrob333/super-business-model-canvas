import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Printer } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isLikelyHtml, salvageReportHtml } from "@/lib/report-content";
import { BASE_REPORT_STYLES } from "@/data/report-templates";

/**
 * Reports render as a light paper sheet regardless of app theme (matching the
 * drawer's "boardroom report" rule) and print as a clean document: the print
 * rules hide everything but the sheet.
 */
const REPORT_SHEET_STYLES = `
.report-sheet { color: #1e293b; }
.report-sheet h1 { font-size: 1.6rem; margin: 0 0 0.25rem; letter-spacing: -0.01em; }
.report-sheet h2 { font-size: 1.1rem; font-weight: 600; color: #334155; margin: 0 0 1.25rem; }
.report-sheet h3 { font-size: 1.05rem; margin: 1.75rem 0 0.6rem; padding-bottom: 0.35rem; border-bottom: 1px solid #e2e8f0; }
.report-sheet h4 { font-size: 0.95rem; }
.report-sheet p, .report-sheet li { font-size: 0.9rem; }
@media print {
  body * { visibility: hidden; }
  .report-sheet, .report-sheet * { visibility: visible; }
  .report-sheet { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; box-shadow: none !important; border: none !important; padding: 0.25in !important; }
}
`;
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface Report {
  id: string;
  company_name: string;
  report_content: string;
  framework_id: string;
  created_at: string;
}

const ReportViewer = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      fetchReport();
    }
  }, [reportId, user, authLoading, navigate]);

  const fetchReport = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("generated_reports")
      .select("*")
      .eq("id", reportId)
      .single();

    if (error) {
      console.error("Error fetching report:", error);
      toast({
        title: "Error",
        description: "Failed to load report",
        variant: "destructive",
      });
      return;
    }

    setReport(data);
    setIsLoading(false);
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;

    const blob = new Blob([report.report_content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.company_name}-${report.framework_id}-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Downloaded",
      description: "Report downloaded as Markdown file",
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64 mb-8" />
        <Card className="p-8">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-2/3" />
        </Card>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div>
      <div className="-mx-6 -mt-6 border-b border-border bg-muted/30 px-6 py-3 mb-6">
        <div className="max-w-4xl mx-auto">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate('/')} className="cursor-pointer">
                  Home
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink onClick={() => navigate('/playbooks')} className="cursor-pointer">
                  Playbooks
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Report</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      <div className="mx-auto max-w-[860px]">
        <div className="mb-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleDownloadMarkdown}>
            <Download className="mr-2 h-4 w-4" />
            Download Markdown
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>

        <style>{BASE_REPORT_STYLES}</style>
        <style>{REPORT_SHEET_STYLES}</style>

        {/* The sheet: always light, paper-proportioned, print-isolated. */}
        <Card className="report-sheet border border-slate-200 bg-white px-8 py-10 shadow-md sm:px-12 sm:py-14">
          <div className="mb-8 border-b border-slate-200 pb-6">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <FileText className="h-4 w-4" />
              <span>{report.company_name}</span>
              <span>•</span>
              <span>
                {new Date(report.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Generated reports are stored as HTML; older or malformed rows
              (raw JSON) are salvaged into formatted HTML. Markdown rendering
              remains only for plain-prose content. */}
          {(() => {
            const content = salvageReportHtml(report.report_content);
            return isLikelyHtml(content) ? (
              <div
                className="prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <div className="prose prose-slate max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            );
          })()}
        </Card>
      </div>
    </div>
  );
};

export default ReportViewer;
