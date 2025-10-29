import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Save, Download } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadFrameworkTemplate, generateBlankTemplate } from '@/lib/framework-import-export';

const FrameworkEditor = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, isAdmin, adminLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    shortcut: '',
    description: '',
    category: '',
    tags: [] as string[],
    when_to_use: '',
    ai_model: 'google/gemini-2.5-flash',
    system_prompt: '',
    analysis_prompt: '',
    output_template: '',
    custom_css: '',
    estimated_time: 15,
    status: 'draft' as 'draft' | 'active' | 'archived'
  });

  useEffect(() => {
    if (!adminLoading && (!user || !isAdmin)) {
      navigate('/admin/frameworks');
      return;
    }

    if (id && id !== 'new') {
      fetchFramework();
    } else {
      setLoading(false);
    }
  }, [id, user, isAdmin, adminLoading]);

  const fetchFramework = async () => {
    try {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setFormData({
        title: data.title,
        shortcut: data.shortcut,
        description: data.description || '',
        category: data.category || '',
        tags: data.tags || [],
        when_to_use: data.when_to_use || '',
        ai_model: data.ai_model || 'google/gemini-2.5-flash',
        system_prompt: data.system_prompt || '',
        analysis_prompt: data.analysis_prompt,
        output_template: data.output_template,
        custom_css: data.custom_css || '',
        estimated_time: data.estimated_time || 15,
        status: data.status || 'draft'
      });
    } catch (error) {
      console.error('Error fetching framework:', error);
      toast({
        title: "Error",
        description: "Failed to load framework",
        variant: "destructive"
      });
      navigate('/admin/frameworks');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (publishStatus: 'draft' | 'active') => {
    if (!formData.title || !formData.shortcut || !formData.analysis_prompt || !formData.output_template) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        status: publishStatus
      };

      if (id && id !== 'new') {
        const { error } = await supabase
          .from('frameworks')
          .update(payload)
          .eq('id', id);

        if (error) throw error;

        toast({
          title: "Framework updated",
          description: `Framework has been ${publishStatus === 'active' ? 'published' : 'saved as draft'}`
        });
      } else {
        const { error } = await supabase
          .from('frameworks')
          .insert(payload);

        if (error) throw error;

        toast({
          title: "Framework created",
          description: `Framework has been ${publishStatus === 'active' ? 'published' : 'created as draft'}`
        });
      }

      navigate('/admin/frameworks');
    } catch (error: any) {
      console.error('Error saving framework:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save framework",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/frameworks')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Library
        </Button>

        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                {id === 'new' ? 'Create Framework' : 'Edit Framework'}
              </h1>
              <p className="text-muted-foreground mt-2">
                Configure framework metadata, AI prompts, and output templates
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => downloadFrameworkTemplate(generateBlankTemplate())}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          <Tabs defaultValue="basic" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="prompt">AI Prompt</TabsTrigger>
              <TabsTrigger value="output">Output Template</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Framework metadata and categorization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Framework Title *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g., Porter's Five Forces"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shortcut">Shortcut Code *</Label>
                      <Input
                        id="shortcut"
                        value={formData.shortcut}
                        onChange={(e) => setFormData({ ...formData, shortcut: e.target.value.toUpperCase() })}
                        placeholder="e.g., PORTER_FIVE"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="What does this framework help analyze?"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Foundation">Foundation</SelectItem>
                          <SelectItem value="Market Analysis">Market Analysis</SelectItem>
                          <SelectItem value="Competitive Strategy">Competitive Strategy</SelectItem>
                          <SelectItem value="Growth Strategy">Growth Strategy</SelectItem>
                          <SelectItem value="Operations">Operations</SelectItem>
                          <SelectItem value="Financial">Financial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="when_to_use">When to Use</Label>
                      <Input
                        id="when_to_use"
                        value={formData.when_to_use}
                        onChange={(e) => setFormData({ ...formData, when_to_use: e.target.value })}
                        placeholder="e.g., When analyzing competitive dynamics"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="prompt" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Analysis Prompt</CardTitle>
                  <CardDescription>Configure how the AI analyzes business context</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="system_prompt">System Prompt</Label>
                    <Textarea
                      id="system_prompt"
                      value={formData.system_prompt}
                      onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                      placeholder="You are a strategic business analyst..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="analysis_prompt">Analysis Prompt Template *</Label>
                    <Textarea
                      id="analysis_prompt"
                      value={formData.analysis_prompt}
                      onChange={(e) => setFormData({ ...formData, analysis_prompt: e.target.value })}
                      placeholder="Based on the business context provided, perform a {{framework}} analysis..."
                      rows={12}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use {'{'}{'{'} businessContext {'}'}{'}'},  {'{'}{'{'} companyName {'}'}{'}'},  etc. for dynamic data
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="output" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Output Template</CardTitle>
                  <CardDescription>Define how results are displayed to users</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="output_template">HTML Template *</Label>
                    <Textarea
                      id="output_template"
                      value={formData.output_template}
                      onChange={(e) => setFormData({ ...formData, output_template: e.target.value })}
                      placeholder='<div class="framework-output">...</div>'
                      rows={12}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom_css">Custom CSS</Label>
                    <Textarea
                      id="custom_css"
                      value={formData.custom_css}
                      onChange={(e) => setFormData({ ...formData, custom_css: e.target.value })}
                      placeholder=".framework-output { /* styles */ }"
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Execution Settings</CardTitle>
                  <CardDescription>Configure AI model and execution parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ai_model">AI Model</Label>
                      <Select
                        value={formData.ai_model}
                        onValueChange={(value) => setFormData({ ...formData, ai_model: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                          <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                          <SelectItem value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimated_time">Estimated Time (seconds)</Label>
                      <Input
                        id="estimated_time"
                        type="number"
                        value={formData.estimated_time}
                        onChange={(e) => setFormData({ ...formData, estimated_time: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Actions */}
          <div className="flex justify-between items-center pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => navigate('/admin/frameworks')}
            >
              Cancel
            </Button>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleSave('draft')}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Draft
              </Button>
              <Button
                onClick={() => handleSave('active')}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Publish
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrameworkEditor;
