import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
import logoLight from "@/assets/superbmc-logo-light.png";
import logoDark from "@/assets/superbmc-logo-dark.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName, getUserInitials } from "@/lib/user-display";
import { clearActiveWorkspaceName } from "@/lib/active-workspace";
import { clearActiveAnalysis } from "@/lib/active-analysis";
import { toast } from "@/hooks/use-toast";

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
  // NavLink's function-as-className isn't used here on purpose: Radix's
  // TooltipTrigger asChild merges the child's className as a string, and
  // stringifying a function prop corrupts the class list. Compute the
  // active state manually instead and pass a plain string.
  const location = useLocation();
  const isActive =
    location.pathname === item.path ||
    location.pathname.startsWith(`${item.path}/`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.path}
          className={cn(
            "flex items-center gap-3 px-3 h-10 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
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

function SidebarUserFooter() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Sign out failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    clearActiveWorkspaceName();
    clearActiveAnalysis();
    navigate("/auth");
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-3 rounded-md p-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {loading ? "Loading..." : displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.email ?? "Not signed in"}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Sign out"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// Shared nav content, reused by the desktop rail and the mobile slide-over Sheet.
export function SidebarNavContent() {
  return (
    <div className="flex h-full flex-col">
      {/* The owner's logo files own the top-left corner (navy BMC in light
          mode, white in dark) — h-14 matches TopBar so the header borders
          align. The company switcher sits one step below. */}
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <img src={logoLight} alt="Super BMC" className="h-8 w-auto dark:hidden" />
        <img src={logoDark} alt="Super BMC" className="hidden h-8 w-auto dark:block" />
      </div>

      {/* Workspace switcher */}
      <div className="flex h-12 shrink-0 items-center border-b px-3">
        <AccountSwitcher />
      </div>

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

      <SidebarUserFooter />
    </div>
  );
}

// Fixed desktop rail. Hidden below md; the mobile equivalent is a Sheet
// slide-over triggered from TopBar, rendering the same SidebarNavContent.
export function SidebarNav() {
  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r bg-card">
      <SidebarNavContent />
    </aside>
  );
}
