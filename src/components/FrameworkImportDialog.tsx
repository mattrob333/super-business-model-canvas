import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileJson, AlertCircle, CheckCircle, Download, Copy } from "lucide-react";
import { parseFrameworkFile, copySchemaToClipboard } from "@/lib/framework-import-export";
import { validateFramework, validateBulkImport } from "@/lib/framework-validation";
import { FrameworkImportExport, BulkFrameworkImport, FrameworkImportResult } from "@/types/framework-schema";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FrameworkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingShortcuts: string[];
  onSuccess: () => void;
}

export function FrameworkImportDialog({ open, onOpenChange, existingShortcuts, onSuccess }: FrameworkImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<FrameworkImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [importAsDraft, setImportAsDraft] = useState(true);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    try {
      const parsed = await parseFrameworkFile(selectedFile);
      
      // Check if it's bulk or single
      if ('frameworks' in parsed) {
        const results = validateBulkImport(parsed.frameworks, existingShortcuts);
        setValidationResults(results);
      } else {
        const result = validateFramework(parsed, existingShortcuts);
        setValidationResults([result]);
      }
    } catch (error) {
      toast({
        title: "Invalid File",
        description: error instanceof Error ? error.message : "Failed to parse JSON file",
        variant: "destructive"
      });
      setFile(null);
      setValidationResults([]);
    }
  };

  const handleImport = async () => {
    if (!file || validationResults.length === 0) return;

    const validFrameworks = validationResults
      .filter(r => r.success && r.framework)
      .map(r => r.framework!);

    if (validFrameworks.length === 0) {
      toast({
        title: "No Valid Frameworks",
        description: "All frameworks have validation errors",
        variant: "destructive"
      });
      return;
    }

    setImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Insert frameworks
      const frameworksToInsert = validFrameworks.map(fw => ({
        title: fw.title,
        shortcut: fw.shortcut,
        description: fw.description,
        category: fw.category,
        tags: fw.tags || [],
        when_to_use: fw.when_to_use || '',
        icon: fw.icon,
        stages: fw.stages || [],
        departments: fw.departments || [],
        goal_alignment: fw.goal_alignment || [],
        ai_model: fw.ai_model || 'google/gemini-2.5-flash',
        system_prompt: fw.system_prompt || '',
        analysis_prompt: fw.analysis_prompt,
        response_schema: fw.response_schema ? JSON.parse(JSON.stringify(fw.response_schema)) : null,
        output_template: fw.output_template,
        custom_css: fw.custom_css || '',
        template_type: fw.template_type || 'html',
        layout_style: fw.layout_style || '',
        estimated_time: fw.estimated_time || 15,
        max_tokens: fw.max_tokens || 4000,
        temperature: fw.temperature || 0.7,
        requires_business_context: fw.requires_business_context ?? true,
        validate_json: fw.validate_json ?? true,
        allow_manual_edit: fw.allow_manual_edit ?? true,
        allow_pdf_export: fw.allow_pdf_export ?? true,
        show_in_playbooks: fw.show_in_playbooks ?? true,
        upstream_frameworks: fw.upstream_frameworks || [],
        downstream_frameworks: fw.downstream_frameworks || [],
        required_upstream: fw.required_upstream || [],
        status: (importAsDraft ? 'draft' : 'active') as 'draft' | 'active' | 'archived',
        created_by: user.id
      }));

      const { error } = await supabase
        .from('frameworks')
        .insert(frameworksToInsert);

      if (error) throw error;

      toast({
        title: "Import Successful",
        description: `Imported ${validFrameworks.length} framework(s) as ${importAsDraft ? 'draft' : 'active'}`,
      });

      onSuccess();
      onOpenChange(false);
      setFile(null);
      setValidationResults([]);
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import frameworks",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  const handleCopySchema = () => {
    const schema = copySchemaToClipboard();
    navigator.clipboard.writeText(schema);
    toast({
      title: "Schema Copied",
      description: "Framework schema copied to clipboard"
    });
  };

  const totalErrors = validationResults.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = validationResults.reduce((sum, r) => sum + r.warnings.length, 0);
  const validCount = validationResults.filter(r => r.success).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Framework(s)</DialogTitle>
          <DialogDescription>
            Upload a JSON file containing one or more framework definitions
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Copy Schema Button */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopySchema} className="flex-1">
              <Copy className="mr-2 h-4 w-4" />
              Copy Schema for AI
            </Button>
          </div>

          {/* File Upload */}
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
              id="framework-file"
            />
            <label htmlFor="framework-file" className="cursor-pointer">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                {file ? file.name : 'Click to upload JSON file'}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports single framework or bulk import
              </p>
            </label>
          </div>

          {/* Validation Results */}
          {validationResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle className="h-4 w-4" />
                    {validCount} valid
                  </span>
                  {totalErrors > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {totalErrors} errors
                    </span>
                  )}
                  {totalWarnings > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertCircle className="h-4 w-4" />
                      {totalWarnings} warnings
                    </span>
                  )}
                </div>
              </div>

              {/* Show errors and warnings */}
              {validationResults.map((result, idx) => (
                <div key={idx} className="space-y-2">
                  {result.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc list-inside text-sm">
                          {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  {result.warnings.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <ul className="list-disc list-inside text-sm">
                          {result.warnings.map((warn, i) => <li key={i}>{warn}</li>)}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}

              {/* Import Options */}
              {validCount > 0 && (
                <div className="flex items-center gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={importAsDraft}
                      onChange={(e) => setImportAsDraft(e.target.checked)}
                      className="rounded"
                    />
                    Import as Draft
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || validCount === 0 || importing}
            >
              <FileJson className="mr-2 h-4 w-4" />
              {importing ? "Importing..." : `Import ${validCount} Framework(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
