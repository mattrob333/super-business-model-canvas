import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, ExternalLink, FileText, Target, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getIconComponent } from '@/lib/icon-utils';
import { exportAnalysisPackage } from '@/lib/analysis-export';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReportViewerDrawer } from "@/components/ReportViewerDrawer";

interface SavedAnalysis {
  id: string;
  company_name: string;
  analysis_data: any;
  created_at: string;
  generated_reports?: {
    id: string;
    framework_id: string;
    report_content: string;
    created_at: string;
    frameworks: {
      title: string;
      icon: string | null;
      category: string | null;
    } | null;
  }[];
}

const MyAnalyses = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [expandedAnalyses, setExpandedAnalyses] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchAnalyses();
    }
  }, [user]);

  const fetchAnalyses = async () => {
    try {
      console.log('🔍 DEBUG: Current user ID:', user?.id);
      console.log('🔍 DEBUG: Fetching analyses...');
      
      const { data, error } = await supabase
        .from('saved_analyses')
        .select(`
          *,
          generated_reports!generated_reports_company_id_fkey (
            id,
            framework_id,
            report_content,
            created_at,
            frameworks (
              title,
              icon,
              category
            )
          )
        `)
        .order('created_at', { ascending: false });

      console.log('🔍 DEBUG: Query result:', { data, error });
      console.log('🔍 DEBUG: Number of analyses found:', data?.length || 0);

      if (error) throw error;
      setAnalyses(data || []);
    } catch (error) {
      console.error('❌ Error fetching analyses:', error);
      toast({
        title: "Error",
        description: "Failed to fetch saved analyses",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      // First, delete related strategy coaching sessions
      const { error: coachingError } = await supabase
        .from('strategy_coaching_sessions')
        .delete()
        .eq('company_id', deleteId);

      if (coachingError) throw coachingError;

      // Then delete the saved analysis (generated_reports will be handled by cascade or already deleted)
      const { error } = await supabase
        .from('saved_analyses')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setAnalyses(analyses.filter(a => a.id !== deleteId));
      toast({
        title: "Deleted",
        description: "Analysis and all associated reports deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting analysis:', error);
      toast({
        title: "Error",
        description: "Failed to delete analysis",
        variant: "destructive"
      });
    } finally {
      setDeleteId(null);
    }
  };

  const loadAnalysis = (analysis: SavedAnalysis) => {
    sessionStorage.setItem('loadedAnalysis', JSON.stringify(analysis.analysis_data));
    navigate('/analyze');
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('generated_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      await fetchAnalyses();
      
      toast({
        title: "Report deleted",
        description: "Report deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error",
        description: "Failed to delete report",
        variant: "destructive"
      });
    }
  };

  const toggleReportsExpanded = (analysisId: string) => {
    setExpandedAnalyses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(analysisId)) {
        newSet.delete(analysisId);
      } else {
        newSet.add(analysisId);
      }
      return newSet;
    });
  };

  const handleExportPackage = async (analysis: SavedAnalysis) => {
    try {
      const reports = analysis.generated_reports?.map(r => ({
        title: r.frameworks?.title || 'Report',
        content: r.report_content,
        framework: r.frameworks?.title || 'report'
      })) || [];
      
      await exportAnalysisPackage(
        analysis.company_name,
        analysis.analysis_data,
        reports
      );
      
      toast({
        title: "Success",
        description: "Analysis package exported successfully"
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "Failed to export analysis package",
        variant: "destructive"
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">My Analyses</h1>
            <p className="text-muted-foreground mt-2">View and manage your saved analyses</p>
          </div>

          {analyses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground text-center mb-4">
                  No saved analyses yet. Analyze a company to get started!
                </p>
                <Button onClick={() => navigate('/analyze')}>
                  Start Analysis
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analyses.map((analysis) => (
                <Card key={analysis.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{analysis.company_name}</CardTitle>
                        <CardDescription>
                          {new Date(analysis.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </CardDescription>
                      </div>
                      {analysis.generated_reports && analysis.generated_reports.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {analysis.generated_reports.length} {analysis.generated_reports.length === 1 ? 'report' : 'reports'}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3">
                    {/* Business Context Summary */}
                    {analysis.analysis_data && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-muted">
                        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Business Context</h4>
                        <div className="space-y-1">
                          {analysis.analysis_data.company?.industry && (
                            <p className="text-xs">
                              <span className="font-medium">Industry:</span> {analysis.analysis_data.company.industry}
                            </p>
                          )}
                          {analysis.analysis_data.company?.businessModel && (
                            <p className="text-xs">
                              <span className="font-medium">Model:</span> {analysis.analysis_data.company.businessModel}
                            </p>
                          )}
                          {analysis.analysis_data.company?.stage && (
                            <p className="text-xs">
                              <span className="font-medium">Stage:</span> {analysis.analysis_data.company.stage}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        className="flex-1"
                        onClick={() => loadAnalysis(analysis)}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Full Analysis
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleExportPackage(analysis)}
                        title="Export Package"
                        aria-label={`Export ${analysis.company_name} package`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Reports Section */}
                    {analysis.generated_reports && analysis.generated_reports.length > 0 && (
                      <div className="mt-2 pt-3 border-t space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4" />
                          Generated Reports
                        </h4>
                        
                        {/* Show first 3 reports or all if expanded */}
                        {(() => {
                          const INITIAL_DISPLAY_COUNT = 3;
                          const isExpanded = expandedAnalyses.has(analysis.id);
                          const reportsToShow = isExpanded 
                            ? analysis.generated_reports 
                            : analysis.generated_reports.slice(0, INITIAL_DISPLAY_COUNT);
                          const remainingCount = analysis.generated_reports.length - INITIAL_DISPLAY_COUNT;
                          
                          return (
                            <>
                              {reportsToShow.map((report) => {
                                const IconComponent = getIconComponent(report.frameworks?.icon);
                                return (
                                  <div
                                    key={report.id}
                                    className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group"
                                    onClick={() => {
                                      setSelectedReportId(report.id);
                                      setReportDrawerOpen(true);
                                    }}
                                  >
                                    <div className="flex items-center gap-2 flex-1">
                                      <IconComponent className="h-4 w-4 text-primary" />
                                      <div>
                                        <p className="font-medium text-xs">
                                          {report.frameworks?.title || "Report"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {new Date(report.created_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteReport(report.id);
                                      }}
                                      className="opacity-70 group-hover:opacity-100"
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                );
                              })}
                              
                              {/* Show More / Show Less Button */}
                              {analysis.generated_reports.length > INITIAL_DISPLAY_COUNT && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => toggleReportsExpanded(analysis.id)}
                                >
                                  {isExpanded 
                                    ? "Show less" 
                                    : `Show ${remainingCount} more ${remainingCount === 1 ? 'report' : 'reports'}`
                                  }
                                </Button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {/* Run More Frameworks Button */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        sessionStorage.setItem('playbookContext', JSON.stringify({
                          companyName: analysis.company_name,
                          businessContext: analysis.analysis_data
                        }));
                        navigate('/playbooks');
                      }}
                    >
                      <Target className="mr-2 h-4 w-4" />
                      Run More Frameworks
                    </Button>

                    <Button
                      variant="destructive"
                      className="w-full mt-auto"
                      onClick={() => setDeleteId(analysis.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Analysis?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this analysis and all associated reports. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ReportViewerDrawer
          reportId={selectedReportId}
          isOpen={reportDrawerOpen}
          onClose={() => setReportDrawerOpen(false)}
        />
      </div>
    </div>
  );
};

export default MyAnalyses;
