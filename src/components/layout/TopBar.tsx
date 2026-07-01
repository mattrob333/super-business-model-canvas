import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Sun, Moon, Search, Bell, ChevronDown, Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarNavContent } from "./SidebarNav";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName, getUserInitials } from "@/lib/user-display";
import { clearActiveWorkspaceName } from "@/lib/active-workspace";
import { toast } from "@/hooks/use-toast";

export function TopBar() {
  const { theme, setTheme } = useTheme();
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
    navigate("/auth");
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-6">
      {/* Mobile nav trigger: sidebar rail is hidden below md, this opens it as a slide-over */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden shrink-0">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[240px] p-0 bg-card">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNavContent />
        </SheetContent>
      </Sheet>

      {/* Left: breadcrumb / page title area */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        <span className="font-medium text-foreground truncate">
          Super BMC Enterprise
        </span>
      </div>

      {/* Center: global search */}
      <div className="flex flex-1 items-center justify-center max-w-xl mx-auto">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search frameworks, analyses, playbooks..."
            className="pl-9 h-9 text-sm bg-muted/50"
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Bell className="h-4 w-4" />
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    initials
                  )}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden md:inline max-w-[140px] truncate">
                {loading ? "Loading..." : displayName}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{displayName}</span>
                {user?.email && (
                  <span className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              Profile &amp; Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
