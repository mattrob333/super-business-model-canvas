import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Grid3X3,
  AlertTriangle,
  Bot,
  Database,
  BookOpen,
  Activity,
  Settings,
  LogOut,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AccountSwitcher } from "./AccountSwitcher";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
  { label: "Canvas", icon: Grid3X3, path: "/canvas" },
  { label: "Gap Register", icon: AlertTriangle, path: "/gaps" },
  { label: "Agents", icon: Bot, path: "/agents" },
  { label: "Knowledge", icon: Database, path: "/knowledge" },
];

const secondaryNavItems: NavItem[] = [
  { label: "Playbooks", icon: BookOpen, path: "/playbooks" },
  { label: "Activity", icon: Activity, path: "/activity" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

function NavItemRow({ item }: { item: NavItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.path}
          className={({ isActive }) =>
            [
              "flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            ].join(" ")
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarNav() {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r bg-card">
      {/* Workspace switcher */}
      <div className="p-3">
        <AccountSwitcher />
      </div>
      <Separator />

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          {mainNavItems.map((item) => (
            <NavItemRow key={item.path} item={item} />
          ))}
        </div>

        <Separator className="my-3" />

        <div className="flex flex-col gap-1">
          {secondaryNavItems.map((item) => (
            <NavItemRow key={item.path} item={item} />
          ))}
        </div>
      </nav>

      <Separator />

      {/* User footer */}
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-md p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">User</p>
            <p className="text-xs text-muted-foreground truncate">
              user@example.com
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
