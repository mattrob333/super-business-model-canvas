import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, Edit, Eye, Copy, Archive, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { FrameworkImportDialog } from '@/components/FrameworkImportDialog';

interface Framework {
  id: string;
  title: string;
  shortcut: string;
  description: string | null;
  category: string | null;
  status: 'draft' | 'active' | 'archived';
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
}

const AdminFrameworks = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, adminLoading } = useAuth();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [filteredFrameworks, setFilteredFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (!authLoading && !adminLoading && user && !isAdmin) {
      toast({
        title: "Access denied",
        description: "You don't have permission to access this page.",
        variant: "destructive"
      });
      navigate('/');
    }
  }, [user, authLoading, isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchFrameworks();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    let filtered = frameworks;

    if (searchTerm) {
      filtered = filtered.filter(f =>
        f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.shortcut.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(f => f.category === categoryFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(f => f.status === statusFilter);
    }

    setFilteredFrameworks(filtered);
  }, [searchTerm, categoryFilter, statusFilter, frameworks]);

  const fetchFrameworks = async () => {
    try {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFrameworks(data || []);
      setFilteredFrameworks(data || []);
    } catch (error) {
      console.error('Error fetching frameworks:', error);
      toast({
        title: "Error",
        description: "Failed to fetch frameworks",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const duplicateFramework = async (frameworkId: string) => {
    try {
      const original = frameworks.find(f => f.id === frameworkId);
      if (!original) return;

      // Create a copy without id, created_at, updated_at
      const { id, created_at, updated_at, ...frameworkData } = original;
      
      const { error } = await supabase
        .from('frameworks')
        .insert([{
          ...frameworkData as any,
          title: `${original.title} (Copy)`,
          shortcut: `${original.shortcut}_COPY_${Date.now()}`,
          status: 'draft' as const,
          usage_count: 0
        }]);

      if (error) throw error;

      toast({
        title: "Framework duplicated",
        description: "Framework has been duplicated as a draft"
      });

      fetchFrameworks();
    } catch (error) {
      console.error('Error duplicating framework:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate framework",
        variant: "destructive"
      });
    }
  };

  const archiveFramework = async (frameworkId: string) => {
    try {
      const { error } = await supabase
        .from('frameworks')
        .update({ status: 'archived' })
        .eq('id', frameworkId);

      if (error) throw error;

      toast({
        title: "Framework archived",
        description: "Framework has been archived"
      });

      fetchFrameworks();
    } catch (error) {
      console.error('Error archiving framework:', error);
      toast({
        title: "Error",
        description: "Failed to archive framework",
        variant: "destructive"
      });
    }
  };

  const categories = Array.from(new Set(frameworks.map(f => f.category).filter(Boolean)));

  if (authLoading || adminLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'draft': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'archived': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Framework Library</h1>
              <p className="text-muted-foreground mt-2">Manage strategic analysis frameworks</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button
                onClick={() => navigate('/admin/frameworks/new')}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Framework
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search frameworks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Framework Grid */}
          {filteredFrameworks.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No frameworks found
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFrameworks.map((framework) => (
                <Card key={framework.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{framework.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {framework.category || 'Uncategorized'}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className={getStatusColor(framework.status)}>
                        {framework.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div>Shortcut: <code className="text-primary">{framework.shortcut}</code></div>
                      <div>Used: {framework.usage_count} times</div>
                      <div>Updated: {new Date(framework.updated_at).toLocaleDateString()}</div>
                    </div>

                    {framework.tags && framework.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {framework.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => navigate(`/admin/frameworks/${framework.id}/edit`)}
                      >
                        <Edit className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/frameworks/${framework.id}/preview`)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => duplicateFramework(framework.id)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {framework.status !== 'archived' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => archiveFramework(framework.id)}
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <FrameworkImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        existingShortcuts={frameworks.map(f => f.shortcut.toLowerCase())}
        onSuccess={fetchFrameworks}
      />
    </div>
  );
};

export default AdminFrameworks;
