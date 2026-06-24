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
import { Switch } from "@/components/ui/switch";
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
import {
  Server,
  Plus,
  Plug,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type McpServer = Database["public"]["Tables"]["mcp_servers"]["Row"];
type McpServerTool = Database["public"]["Tables"]["mcp_server_tools"]["Row"];
type McpServerStatus = Database["public"]["Enums"]["mcp_server_status"];
type McpTransportType = Database["public"]["Enums"]["mcp_transport_type"];

/**
 * MCP Server Connections Manager
 *
 * Lists MCP (Model Context Protocol) servers configured for the workspace.
 * Agents can access tools from connected MCP servers during execution.
 *
 * Data sources: `mcp_servers` + `mcp_server_tools` tables.
 * Encrypted columns (headers_encrypted, env_encrypted) are never returned
 * to the browser — only metadata is displayed.
 */

const STATUS_CONFIG: Record<
  McpServerStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  connected: {
    label: "Connected",
    className: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  disconnected: {
    label: "Disconnected",
    className: "bg-muted text-muted-foreground border-border",
    icon: AlertCircle,
  },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
  untested: {
    label: "Untested",
    className: "bg-muted text-muted-foreground border-border",
    icon: AlertCircle,
  },
};

const TRANSPORT_OPTIONS: { value: McpTransportType; label: string }[] = [
  { value: "stdio", label: "stdio (local process)" },
  { value: "http", label: "HTTP (remote)" },
  { value: "sse", label: "SSE (server-sent events)" },
  { value: "websocket", label: "WebSocket" },
];

// Only select safe columns — never headers_encrypted or env_encrypted
const SERVER_COLUMNS =
  "id, name, transport_type, command, url, auth_type, enabled, status, last_tested_at, created_at" as const;

export function McpConnectionsManager({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpServerTool[]>>({});
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newTransport, setNewTransport] = useState<McpTransportType>("stdio");
  const [newCommand, setNewCommand] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newAuthType, setNewAuthType] = useState("");

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mcp_servers")
        .select(SERVER_COLUMNS)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const serverList = (data ?? []) as unknown as McpServer[];
      setServers(serverList);

      // Fetch tools for each server
      if (serverList.length > 0) {
        const serverIds = serverList.map((s) => s.id);
        const { data: toolsData, error: toolsError } = await supabase
          .from("mcp_server_tools")
          .select("*")
          .in("mcp_server_id", serverIds);

        if (toolsError) throw toolsError;

        const toolMap: Record<string, McpServerTool[]> = {};
        for (const tool of (toolsData ?? []) as unknown as McpServerTool[]) {
          if (!toolMap[tool.mcp_server_id]) {
            toolMap[tool.mcp_server_id] = [];
          }
          toolMap[tool.mcp_server_id].push(tool);
        }
        setToolsByServer(toolMap);
      }
    } catch (err) {
      toast({
        title: "Failed to load MCP servers",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  const handleAdd = async () => {
    if (!newName) {
      toast({
        title: "Missing fields",
        description: "Server name is required.",
        variant: "destructive",
      });
      return;
    }

    if (newTransport === "stdio" && !newCommand) {
      toast({
        title: "Missing command",
        description: "stdio transport requires a command (e.g. npx, python3).",
        variant: "destructive",
      });
      return;
    }

    if (newTransport !== "stdio" && !newUrl) {
      toast({
        title: "Missing URL",
        description: "Remote transports require a URL.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("mcp_servers").insert({
        account_id: accountId,
        name: newName,
        transport_type: newTransport,
        command: newTransport === "stdio" ? newCommand : null,
        url: newTransport !== "stdio" ? newUrl : null,
        auth_type: newAuthType || null,
        args: newTransport === "stdio" ? [] : null,
        enabled: false,
        status: "untested",
      });

      if (error) throw error;

      toast({
        title: "MCP server added",
        description: `${newName} has been added (untested). Test the connection to discover tools.`,
      });

      setNewName("");
      setNewCommand("");
      setNewUrl("");
      setNewAuthType("");
      setAddDialogOpen(false);
      void fetchServers();
    } catch (err) {
      toast({
        title: "Failed to add server",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (server: McpServer) => {
    setToggling(server.id);
    try {
      const { error } = await supabase
        .from("mcp_servers")
        .update({ enabled: !server.enabled })
        .eq("id", server.id);

      if (error) throw error;

      setServers((prev) =>
        prev.map((s) =>
          s.id === server.id ? { ...s, enabled: !s.enabled } : s
        )
      );

      toast({
        title: server.enabled ? "Server disabled" : "Server enabled",
        description: `${server.name} is now ${server.enabled ? "disabled" : "enabled"}.`,
      });
    } catch (err) {
      toast({
        title: "Failed to toggle",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setToggling(null);
    }
  };

  const handleTest = async (server: McpServer) => {
    setToggling(server.id);
    try {
      const { error } = await supabase.functions.invoke("test-mcp-server", {
        body: { serverId: server.id, accountId },
      });

      if (error) throw error;

      toast({
        title: "Test complete",
        description: `${server.name} connection test finished. Refreshing status...`,
      });
      void fetchServers();
    } catch (err) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });

      // Update status to error
      try {
        await supabase
          .from("mcp_servers")
          .update({ status: "error" as McpServerStatus, last_tested_at: new Date().toISOString() })
          .eq("id", server.id);
      } catch {
        // Ignore update error
      }
      void fetchServers();
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (server: McpServer) => {
    try {
      // Delete tools first (cascade may handle this, but be explicit)
      await supabase
        .from("mcp_server_tools")
        .delete()
        .eq("mcp_server_id", server.id);

      const { error } = await supabase
        .from("mcp_servers")
        .delete()
        .eq("id", server.id);

      if (error) throw error;

      toast({
        title: "Server deleted",
        description: `${server.name} has been removed.`,
      });
      void fetchServers();
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
          <Server className="h-4 w-4" />
          MCP Server Connections
        </CardTitle>
        <CardDescription>
          Manage Model Context Protocol servers. Agents access tools from
          connected servers during analysis. Encrypted headers and environment
          variables are never returned to the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {servers.length} server{servers.length !== 1 ? "s" : ""} configured
          </p>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={fetchServers}
              >
                <Plus className="h-4 w-4" />
                Add Server
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add MCP Server</DialogTitle>
                <DialogDescription>
                  Configure a new MCP server connection. Sensitive fields
                  (headers, env vars) are encrypted server-side.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="mcp-name">Server Name</Label>
                  <Input
                    id="mcp-name"
                    placeholder="e.g. Web Search MCP"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-transport">Transport Type</Label>
                  <Select
                    value={newTransport}
                    onValueChange={(v) => setNewTransport(v as McpTransportType)}
                  >
                    <SelectTrigger id="mcp-transport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newTransport === "stdio" ? (
                  <div className="space-y-2">
                    <Label htmlFor="mcp-command">Command</Label>
                    <Input
                      id="mcp-command"
                      placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem"
                      value={newCommand}
                      onChange={(e) => setNewCommand(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The command to launch the MCP server process.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="mcp-url">URL</Label>
                    <Input
                      id="mcp-url"
                      placeholder="https://mcp.example.com/sse"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="mcp-auth">Auth Type (optional)</Label>
                  <Input
                    id="mcp-auth"
                    placeholder="e.g. bearer, api-key, none"
                    value={newAuthType}
                    onChange={(e) => setNewAuthType(e.target.value)}
                  />
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
                    "Add Server"
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
        ) : servers.length === 0 ? (
          <div className="py-8 text-center">
            <Server className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No MCP servers configured. Add a server to give agents access to
              external tools and data sources.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const statusCfg = STATUS_CONFIG[server.status] ?? STATUS_CONFIG.untested;
              const tools = toolsByServer[server.id] ?? [];
              const isExpanded = expandedServer === server.id;
              return (
                <div key={server.id} className="rounded-lg border">
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Server className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{server.name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {server.transport_type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusCfg.className}`}
                          >
                            <statusCfg.icon className="h-2.5 w-2.5 mr-1" />
                            {statusCfg.label}
                          </Badge>
                          {tools.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Wrench className="h-2.5 w-2.5 mr-1" />
                              {tools.length} tool{tools.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                          {server.command ?? server.url ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={server.enabled}
                        onCheckedChange={() => handleToggle(server)}
                        disabled={toggling === server.id}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Test connection"
                        disabled={toggling === server.id}
                        onClick={() => handleTest(server)}
                      >
                        {toggling === server.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plug className="h-4 w-4" />
                        )}
                      </Button>
                      {tools.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={isExpanded ? "Hide tools" : "Show tools"}
                          onClick={() =>
                            setExpandedServer(isExpanded ? null : server.id)
                          }
                        >
                          <Wrench
                            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Delete"
                        onClick={() => handleDelete(server)}
                      >
                        <Plus className="h-4 w-4 rotate-45" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && tools.length > 0 && (
                    <div className="border-t px-3 py-2 bg-muted/30">
                      <div className="space-y-1">
                        {tools.map((tool) => (
                          <div
                            key={tool.id}
                            className="flex items-center justify-between gap-2 py-1"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-xs font-mono truncate">
                                {tool.tool_name}
                              </span>
                              {tool.description && (
                                <span className="text-xs text-muted-foreground truncate">
                                  — {tool.description}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  tool.risk_level === "high"
                                    ? "bg-destructive/10 text-destructive"
                                    : tool.risk_level === "medium"
                                    ? "bg-warning/10 text-warning"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {tool.risk_level}
                              </Badge>
                              <Switch
                                checked={tool.enabled}
                                className="scale-75"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
