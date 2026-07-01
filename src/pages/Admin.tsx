import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, ArrowLeft, Search, Edit, Eye, Copy, Archive, Upload, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { FrameworkImportDialog } from '@/components/FrameworkImportDialog';

interface Lead {
  id: string;
  email: string;
  created_at: string;
}

interface Profile {
  id: string;
  email: string;
  created_at: string;
}

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

const Admin = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin, adminLoading } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileSearchTerm, setProfileSearchTerm] = useState('');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [filteredFrameworks, setFilteredFrameworks] = useState<Framework[]>([]);
  const [frameworkSearchTerm, setFrameworkSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('users-leads');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (!authLoading && !adminLoading && user && !isAdmin) {
      toast({
        title: "Access denied",
        description: "You don't have permission to access the admin dashboard.",
        variant: "destructive"
      });
      navigate('/');
    }
  }, [user, authLoading, isAdmin, adminLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchLeads();
      fetchProfiles();
      fetchFrameworks();
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (profileSearchTerm) {
      setFilteredProfiles(
        profiles.filter(profile =>
          profile.email.toLowerCase().includes(profileSearchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredProfiles(profiles);
    }
  }, [profileSearchTerm, profiles]);

  useEffect(() => {
    if (leadSearchTerm) {
      setFilteredLeads(
        leads.filter(lead =>
          lead.email.toLowerCase().includes(leadSearchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredLeads(leads);
    }
  }, [leadSearchTerm, leads]);

  useEffect(() => {
    let filtered = frameworks;

    if (frameworkSearchTerm) {
      filtered = filtered.filter(f =>
        f.title.toLowerCase().includes(frameworkSearchTerm.toLowerCase()) ||
        f.shortcut.toLowerCase().includes(frameworkSearchTerm.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(f => f.category === categoryFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(f => f.status === statusFilter);
    }

    setFilteredFrameworks(filtered);
  }, [frameworkSearchTerm, categoryFilter, statusFilter, frameworks]);

  const fetchLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
      setFilteredLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast({
        title: "Error",
        description: "Failed to fetch leads",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
      setFilteredProfiles(data || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: "Error",
        description: "Failed to fetch registered users",
        variant: "destructive"
      });
    }
  };

  const exportProfilesToCSV = () => {
    const headers = ['Email', 'Account Created'];
    const csvContent = [
      headers.join(','),
      ...filteredProfiles.map(profile =>
        [profile.email, new Date(profile.created_at).toLocaleString()].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registered_users_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Registered users exported to CSV"
    });
  };

  const exportLeadsToCSV = () => {
    const headers = ['Email', 'Captured At'];
    const csvContent = [
      headers.join(','),
      ...filteredLeads.map(lead =>
        [lead.email, new Date(lead.created_at).toLocaleString()].join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email_leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Email leads exported to CSV"
    });
  };

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
    }
  };

  const duplicateFramework = async (frameworkId: string) => {
    try {
      const original = frameworks.find(f => f.id === frameworkId);
      if (!original) return;

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/10 text-success border-success/20';
      case 'draft': return 'bg-warning/10 text-warning border-warning/20';
      case 'archived': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStats = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return {
      totalUsers: profiles.length,
      totalLeads: leads.length,
      usersToday: profiles.filter(profile => new Date(profile.created_at) >= today).length,
      leadsToday: leads.filter(lead => new Date(lead.created_at) >= today).length
    };
  };

  if (authLoading || adminLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const stats = getStats();
  const categories = Array.from(new Set(frameworks.map(f => f.category).filter(Boolean)));

  return (
    <div>
      <div className="max-w-7xl mx-auto">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
            <p className="text-muted-foreground mt-2">Manage leads, frameworks, and monitor growth</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 max-w-2xl mx-auto">
              <TabsTrigger value="users-leads">User & Lead Management</TabsTrigger>
              <TabsTrigger value="frameworks">Framework Library</TabsTrigger>
            </TabsList>

            <TabsContent value="users-leads" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Registered Users</CardDescription>
                    <CardTitle className="text-3xl">{stats.totalUsers}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Email Leads</CardDescription>
                    <CardTitle className="text-3xl">{stats.totalLeads}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>New Users Today</CardDescription>
                    <CardTitle className="text-3xl">{stats.usersToday}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>New Leads Today</CardDescription>
                    <CardTitle className="text-3xl">{stats.leadsToday}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <CardTitle>Registered Users</CardTitle>
                      <CardDescription>Authenticated accounts with full access</CardDescription>
                    </div>
                    <Button onClick={exportProfilesToCSV} disabled={filteredProfiles.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Export Users
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search by email..."
                      value={profileSearchTerm}
                      onChange={(e) => setProfileSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                    
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Account Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProfiles.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground">
                                No registered users found
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredProfiles.map((profile) => (
                              <TableRow key={profile.id}>
                                <TableCell className="font-medium">{profile.email}</TableCell>
                                <TableCell>
                                  {new Date(profile.created_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <CardTitle>Email Leads</CardTitle>
                      <CardDescription>Email captures from landing page (not yet registered)</CardDescription>
                    </div>
                    <Button onClick={exportLeadsToCSV} disabled={filteredLeads.length === 0}>
                      <Download className="mr-2 h-4 w-4" />
                      Export Leads
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search by email..."
                      value={leadSearchTerm}
                      onChange={(e) => setLeadSearchTerm(e.target.value)}
                      className="max-w-sm"
                    />
                    
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Captured At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredLeads.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center text-muted-foreground">
                                No email leads found
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredLeads.map((lead) => (
                              <TableRow key={lead.id}>
                                <TableCell className="font-medium">{lead.email}</TableCell>
                                <TableCell>
                                  {new Date(lead.created_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="frameworks" className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Framework Library</h2>
                  <p className="text-muted-foreground mt-1">Manage strategic analysis frameworks</p>
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

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search frameworks..."
                        value={frameworkSearchTerm}
                        onChange={(e) => setFrameworkSearchTerm(e.target.value)}
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
            </TabsContent>
          </Tabs>
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

export default Admin;
