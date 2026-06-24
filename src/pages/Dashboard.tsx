import { Heart, AlertTriangle, Clock, Shield, FileText, RefreshCw, Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { StrategicHealthPanel } from "@/components/dashboard/StrategicHealthPanel";

const Dashboard = () => {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enterprise strategy operating overview
        </p>
      </div>

      {/* Top row — 4 metric tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricTile
          title="Strategic Health Score"
          value="--"
          subtitle="Not yet assessed"
          icon={Heart}
        />
        <MetricTile
          title="Active Gaps"
          value="0"
          icon={AlertTriangle}
        />
        <MetricTile
          title="Context Freshness"
          value="No context"
          subtitle="Awaiting data ingestion"
          icon={Clock}
        />
        <MetricTile
          title="Evidence Coverage"
          value="0%"
          subtitle="No evidence collected"
          icon={Shield}
        />
      </div>

      {/* Middle row — 2 panels + activity rail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Recent Agent Activity */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              Recent Agent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 py-2">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    No agent activity yet. Agents will run when workspace is configured.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure AI providers and playbooks in Settings to begin.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled Loops Status */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Scheduled Loops
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs">0 Active</Badge>
              <Badge variant="outline" className="text-xs">0 Paused</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              No loops configured. Set up scheduled agents in Settings.
            </p>
          </CardContent>
        </Card>

        {/* Strategic Health Panel (right rail) */}
        <div className="xl:col-span-1">
          <StrategicHealthPanel />
        </div>
      </div>

      {/* Bottom row — Recent Reports */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No reports generated.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Run a playbook to create your first report.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
