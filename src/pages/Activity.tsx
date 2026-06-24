import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Bot, Clock, RefreshCw } from "lucide-react";

/**
 * Activity page (/activity)
 *
 * Shows the real-time activity stream — agent runs, canvas edits, gap
 * discoveries, evidence collection, and scheduled loop executions.
 *
 * Data source: `agent_runs` table (Phase 2 schema). Currently shows empty
 * state until agent runs start producing activity.
 */

export default function Activity() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time activity stream — agent runs, canvas edits, gap
            discoveries, evidence collection, and scheduled loop executions.
          </p>
        </div>
      </div>

      {/* Activity types legend */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="text-xs gap-1.5">
          <Bot className="h-3 w-3" />
          Agent Run
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Activity className="h-3 w-3" />
          Canvas Edit
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <Clock className="h-3 w-3" />
          Gap Discovery
        </Badge>
        <Badge variant="outline" className="text-xs gap-1.5">
          <RefreshCw className="h-3 w-3" />
          Scheduled Loop
        </Badge>
      </div>

      {/* Empty state */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity Stream
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No activity yet. Agent runs, canvas edits, and gap discoveries
              will appear here in real time.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Configure AI providers in Settings and run a playbook to begin.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
