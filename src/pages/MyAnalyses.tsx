import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, ExternalLink, FileText, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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
      const { data, error } = await supabase
        .from('saved_analyses')
        .select(`
          *,
          generated_reports (
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

      if (error) throw error;
      setAnalyses(data || []);
    } catch (error) {
      console.error('Error fetching analyses:', error);
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
                    <Button
                      variant="default"
                      className="w-full"
                      onClick={() => loadAnalysis(analysis)}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Analysis
                    </Button>

                    {/* Reports Section */}
                    {analysis.generated_reports && analysis.generated_reports.length > 0 && (
                      <div className="mt-2 pt-3 border-t space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4" />
                          Generated Reports
                        </h4>
                        {analysis.generated_reports.map((report) => (
                          <div
                            key={report.id}
                            className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <div className="text-xl">{report.frameworks?.icon || "📊"}</div>
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
                              onClick={() => {
                                setSelectedReportId(report.id);
                                setReportDrawerOpen(true);
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

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
