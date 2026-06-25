import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Key, Plus, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ProviderCredential = Database["public"]["Tables"]["provider_credentials"]["Row"];
type CredentialStatus = Database["public"]["Enums"]["credential_status"];

/**
 * AI Provider Credentials Manager
 *
 * Lists provider credentials (API keys) stored in the `provider_credentials`
 * table. The `encrypted_secret` column is NEVER selected — only metadata
 * (provider, label, last_four, status, validated_at) is returned to the
 * browser. Adding/validating keys requires an Edge Function that performs
 * the encryption server-side.
 *
 * Guardrail: Never expose secrets to browser. Never return provider keys
 * to client after save.
 */

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "xai", label: "xAI (Grok)" },
  { value: "google", label: "Google AI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "mistral", label: "Mistral AI" },
  { value: "local", label: "Local (Ollama)" },
] as const;

const STATUS_CONFIG: Record<
  CredentialStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  untested: {
    label: "Untested",
    className: "bg-muted text-muted-foreground border-border",
    icon: AlertCircle,
  },
  expired: {
    label: "Expired",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
  revoked: {
    label: "Revoked",
    className: "bg-muted/50 text-muted-foreground border-border",
    icon: AlertCircle,
  },
};

// Only select columns that are safe to return to browser — never encrypted_secret
const SAFE_COLUMNS =
  "id, provider, label, secret_last_four, status, validated_at, created_at" as const;

export function ProviderCredentialsManager({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSecret, setNewSecret] = useState("");

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("provider_credentials")
        .select(SAFE_COLUMNS)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCredentials((data ?? []) as unknown as ProviderCredential[]);
    } catch (err) {
      toast({
        title: "Failed to load credentials",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  const handleAdd = async () => {
    if (!newProvider || !newSecret) {
      toast({
        title: "Missing fields",
        description: "Provider and API key are required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Call the edge function that encrypts the secret server-side.
      // The browser NEVER stores or sees the plaintext after this call.
      const { error } = await supabase.functions.invoke("manage-provider-key", {
        body: {
          action: "add",
          accountId,
          provider: newProvider,
          label: newLabel || undefined,
          secret: newSecret,
        },
      });

      if (error) throw error;

      toast({
        title: "Provider key saved",
        description: `${PROVIDER_OPTIONS.find((p) => p.value === newProvider)?.label ?? newProvider} credential added successfully.`,
      });

      setNewProvider("");
      setNewLabel("");
      setNewSecret("");
      setAddDialogOpen(false);
      void fetchCredentials();
    } catch (err) {
      toast({
        title: "Failed to save key",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string, provider: string) => {
    try {
      const { error } = await supabase
        .from("provider_credentials")
        .update({ status: "revoked" as CredentialStatus })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Credential revoked",
        description: `${provider} key has been revoked.`,
      });
      void fetchCredentials();
    } catch (err) {
      toast({
        title: "Failed to revoke",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, provider: string) => {
    try {
      const { error } = await supabase
        .from("provider_credentials")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Credential deleted",
        description: `${provider} key has been permanently removed.`,
      });
      void fetchCredentials();
    } catch (err) {
      toast({
        title: "Failed to delete",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Key className="h-4 w-4" />
          AI Provider Keys
        </CardTitle>
        <CardDescription>
          Manage API keys for AI model providers. Keys are encrypted at the
          application layer and never returned to the browser after save.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {credentials.length} credential{credentials.length !== 1 ? "s" : ""} configured
          </p>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={fetchCredentials}
              >
                <Plus className="h-4 w-4" />
                Add Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Provider Key</DialogTitle>
                <DialogDescription>
                  The key is encrypted server-side and never stored in browser
                  memory after submission.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select value={newProvider} onValueChange={setNewProvider}>
                    <SelectTrigger id="provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input
                    id="label"
                    placeholder="e.g. Production OpenAI key"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secret">API Key</Label>
                  <Input
                    id="secret"
                    type="password"
                    placeholder="sk-..."
                    value={newSecret}
                    onChange={(e) => setNewSecret(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The key will be masked as ••••<span className="font-mono">XXXX</span> after saving.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save & Encrypt"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : credentials.length === 0 ? (
          <div className="py-8 text-center">
            <Key className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No provider keys configured. Add a key to enable AI-powered
              analysis.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {credentials.map((cred) => {
              const statusCfg = STATUS_CONFIG[cred.status] ?? STATUS_CONFIG.untested;
              const providerLabel =
                PROVIDER_OPTIONS.find((p) => p.value === cred.provider)?.label ??
                cred.provider;
              return (
                <div
                  key={cred.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{providerLabel}</p>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusCfg.className}`}
                        >
                          <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cred.label && <span className="font-medium">{cred.label} · </span>}
                        {cred.secret_last_four ? (
                          <span className="font-mono">••••{cred.secret_last_four}</span>
                        ) : (
                          <span className="font-mono">••••</span>
                        )}
                        {cred.validated_at && (
                          <span> · validated {new Date(cred.validated_at).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {cred.status !== "revoked" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-warning"
                        title="Revoke"
                        aria-label={`Revoke ${providerLabel} credential`}
                        onClick={() => handleRevoke(cred.id, providerLabel)}
                      >
                        <AlertCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Delete permanently"
                      aria-label={`Delete ${providerLabel} credential permanently`}
                      onClick={() => handleDelete(cred.id, providerLabel)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
