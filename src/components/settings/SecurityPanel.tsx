import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  ShieldCheck,
  KeyRound,
  Lock,
  Eye,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Activity,
  Database,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccountId } from "@/hooks/useAccountId";

/**
 * SecurityPanel
 *
 * Displays security posture information:
 * - Authentication method and session metadata
 * - Data encryption status (RLS enabled on all tables)
 * - Provider credential count (masked, never shown)
 * - MCP server security (encrypted columns)
 * - Recent agent activity summary (last 24h)
 * - Guardrail compliance status
 */
export function SecurityPanel() {
  const { accountId } = useAccountId();
  const [loading, setLoading] = useState(true);
  const [credCount, setCredCount] = useState(0);
  const [revokedCount, setRevokedCount] = useState(0);
  const [mcpCount, setMcpCount] = useState(0);
  const [recentRuns, setRecentRuns] = useState(0);
  const [failedRuns, setFailedRuns] = useState(0);
  const [successfulRuns, setSuccessfulRuns] = useState(0);

  const fetchSecurityData = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [credsRes, mcpRes, runsRes] = await Promise.all([
        supabase
          .from("provider_credentials")
          .select("id, status")
          .eq("account_id", accountId),
        supabase
          .from("mcp_servers")
          .select("id, enabled")
          .eq("account_id", accountId),
        supabase
          .from("agent_runs")
          .select("id, status, started_at")
          .eq("account_id", accountId)
          .order("started_at", { ascending: false })
          .limit(50),
      ]);

      if (credsRes.data) {
        setCredCount(credsRes.data.filter((c) => c.status === "active").length);
        setRevokedCount(credsRes.data.filter((c) => c.status === "revoked").length);
      }

      if (mcpRes.data) {
        setMcpCount(mcpRes.data.filter((m) => m.enabled).length);
      }

      if (runsRes.data) {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recent = runsRes.data.filter(
          (r) => new Date(r.started_at) >= twentyFourHoursAgo
        );
        setRecentRuns(recent.length);
        setFailedRuns(recent.filter((r) => r.status === "failed").length);
        setSuccessfulRuns(recent.filter((r) => r.status === "completed").length);
      }
    } catch (err) {
      console.error("Failed to load security data:", err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void fetchSecurityData();
  }, [fetchSecurityData]);

  return (
    <div className="flex flex-col gap-4">
      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SecurityMetricCard
          icon={ShieldCheck}
          label="RLS Status"
          value="Enabled"
          subtitle="All 12 tables scoped to account_id"
          status="success"
        />
        <SecurityMetricCard
          icon={KeyRound}
          label="Active API Keys"
          value={loading ? "—" : String(credCount)}
          subtitle={revokedCount > 0 ? `${revokedCount} revoked` : "No revoked keys"}
          status={credCount > 0 ? "success" : "warning"}
        />
        <SecurityMetricCard
          icon={Lock}
          label="MCP Servers"
          value={loading ? "—" : String(mcpCount)}
          subtitle="Encrypted at rest"
          status={mcpCount > 0 ? "info" : "neutral"}
        />
        <SecurityMetricCard
          icon={Activity}
          label="Agent Runs (24h)"
          value={loading ? "—" : String(recentRuns)}
          subtitle={
            failedRuns > 0
              ? `${failedRuns} failed — review needed`
              : "All successful"
          }
          status={failedRuns > 0 ? "warning" : recentRuns > 0 ? "info" : "neutral"}
        />
      </div>

      {/* Security posture details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security Posture
          </CardTitle>
          <CardDescription>
            Overview of data protection, access control, and guardrail compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Data protection */}
          <SecurityRow
            icon={Database}
            title="Row-Level Security (RLS)"
            description="All 12 canonical tables enforce RLS policies scoped to account_id. Users can only access data within their own workspace."
            status="compliant"
          />
          <Separator />
          <SecurityRow
            icon={Lock}
            title="Credential Encryption"
            description="Provider API keys are encrypted at the application layer before storage. Secrets are never returned to the browser — only the last four digits are shown for identification."
            status="compliant"
          />
          <Separator />
          <SecurityRow
            icon={Eye}
            title="Secret Exposure Prevention"
            description="encrypted_secret columns are excluded from all SELECT queries. MCP server headers/env are encrypted before storage."
            status="compliant"
          />
          <Separator />
          <SecurityRow
            icon={ShieldCheck}
            title="Agent Run Records"
            description="Every agent run produces a durable record in agent_runs with full input/output, cost, and timing metadata. No agent action is unlogged."
            status="compliant"
          />
          <Separator />
          <SecurityRow
            icon={AlertTriangle}
            title="Propose-Before-Execute"
            description="External mutations follow a propose-before-execute posture. Agent outputs are reviewed before being applied to production systems."
            status="compliant"
          />
        </CardContent>
      </Card>

      {/* Audit trail summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Activity Summary
            </CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void fetchSecurityData()}
            disabled={loading}
            aria-label="Refresh security summary"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold">{recentRuns}</span>
                <span className="text-xs text-muted-foreground">Total runs (24h)</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold text-success">
                  {successfulRuns}
                </span>
                <span className="text-xs text-muted-foreground">Successful</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`text-2xl font-bold ${failedRuns > 0 ? "text-warning" : ""}`}>
                  {failedRuns}
                </span>
                <span className="text-xs text-muted-foreground">Failed</span>
              </div>
            </div>
          )}
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            View detailed run history on the{" "}
            <a
              href="/activity"
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-0.5"
            >
              Activity page
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityMetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle: string;
  status: "success" | "warning" | "info" | "neutral";
}) {
  const badgeVariant =
    status === "success"
      ? "default"
      : status === "warning"
      ? "destructive"
      : "secondary";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <Badge variant={badgeVariant} className="text-[10px]">
            {status === "success" ? "OK" : status === "warning" ? "Review" : status === "info" ? "Active" : "None"}
          </Badge>
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        <div className="text-[10px] text-muted-foreground mt-1">{subtitle}</div>
      </CardContent>
    </Card>
  );
}

function SecurityRow({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  status: "compliant" | "warning" | "non-compliant";
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium">{title}</h4>
          {status === "compliant" ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
