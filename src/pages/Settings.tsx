import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const tabSections = [
  { id: "general", label: "General" },
  { id: "ai-providers", label: "AI Providers" },
  { id: "model-routing", label: "Model Routing" },
  { id: "mcp", label: "MCP Connections" },
  { id: "hermes", label: "Hermes Runtime" },
  { id: "schedules", label: "Schedules" },
  { id: "security", label: "Security" },
] as const;

type TabId = (typeof tabSections)[number]["id"];

interface PlaceholderTabProps {
  sectionName: string;
  description: string;
}

function PlaceholderTab({ sectionName, description }: PlaceholderTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{sectionName}</CardTitle>
        <CardDescription>
          Configure {sectionName.toLowerCase()} to enable this feature.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

const Settings = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage workspace configuration and preferences
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          {tabSections.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          {/* Theme */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Sun className="h-4 w-4" />
                Theme
              </CardTitle>
              <CardDescription>
                Select the appearance for the workspace interface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value)}
                className="space-y-3"
              >
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="light" id="theme-light" />
                  <Label htmlFor="theme-light" className="flex items-center gap-2 cursor-pointer">
                    <Sun className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Light</p>
                      <p className="text-xs text-muted-foreground">Light background with dark text</p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="dark" id="theme-dark" />
                  <Label htmlFor="theme-dark" className="flex items-center gap-2 cursor-pointer">
                    <Moon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Dark</p>
                      <p className="text-xs text-muted-foreground">Dark background with light text</p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="system" id="theme-system" />
                  <Label htmlFor="theme-system" className="flex items-center gap-2 cursor-pointer">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">System</p>
                      <p className="text-xs text-muted-foreground">Follow your operating system preference</p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Workspace */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Workspace
              </CardTitle>
              <CardDescription>
                Current workspace configuration details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Workspace Name</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The name of the active workspace
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Default Workspace
                </Badge>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Timezone</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Used for scheduling and timestamps
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  UTC
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholder tabs */}
        <TabsContent value="ai-providers">
          <PlaceholderTab
            sectionName="AI Providers"
            description="Connect and manage external AI model providers such as OpenAI, Anthropic, DeepSeek, and local models. Configure API keys, rate limits, and per-model settings."
          />
        </TabsContent>

        <TabsContent value="model-routing">
          <PlaceholderTab
            sectionName="Model Routing"
            description="Define rules for routing requests to specific AI models based on task type, complexity, cost, or latency requirements. Includes fallback chains and load balancing."
          />
        </TabsContent>

        <TabsContent value="mcp">
          <PlaceholderTab
            sectionName="MCP Connections"
            description="Manage Model Context Protocol server connections. Connect to external tools, APIs, and data sources that agents can access during execution."
          />
        </TabsContent>

        <TabsContent value="hermes">
          <PlaceholderTab
            sectionName="Hermes Runtime"
            description="Configure the Hermes agent runtime: concurrency limits, execution sandboxing, logging verbosity, and agent lifecycle policies."
          />
        </TabsContent>

        <TabsContent value="schedules">
          <PlaceholderTab
            sectionName="Schedules"
            description="Set up recurring agent runs, monitor health check intervals, and manage cron-based execution schedules for automated strategy analysis."
          />
        </TabsContent>

        <TabsContent value="security">
          <PlaceholderTab
            sectionName="Security"
            description="Manage authentication methods, role-based access control, API key rotation, audit logging, and data encryption settings."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
