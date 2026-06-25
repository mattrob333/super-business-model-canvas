import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, LogOut, User, Plus, Shield } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export const Navigation = () => {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const isOnAnalysisPage = location.pathname === '/analyze';
  
  const navLinks = [
    { to: "/analyze", label: "Analyze" },
    { to: "/playbooks", label: "Playbooks" },
    { to: "/my-analyses", label: "My Analyses" },
  ];

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You've been signed out successfully",
    });
    navigate("/");
  };
  
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.12] bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 md:px-6 py-4">
        <nav className="flex items-center justify-between">
          {/* Logo */}
          <button
            type="button"
            className="flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            onClick={() => navigate(user ? '/analyze' : '/')}
            aria-label="Go to home"
          >
            <div className="inline-flex items-center bg-[#C4F82A] text-black px-3 py-1 rounded-full font-montserrat">
              <span className="text-xl">SUPER</span>
            </div>
            <h1 className="text-xl font-montserrat font-light text-white">
              <span className="md:hidden">BMC</span>
              <span className="hidden md:inline">BUSINESS MODEL CANVAS</span>
            </h1>
          </button>

          {/* Desktop Navigation */}
          {user && (
            <div className="hidden md:flex items-center gap-6">
              {navLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1 ${
                      isActive ? 'text-primary border-b-2 border-primary pb-1' : 'text-muted-foreground'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          )}
          
          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* AI Badge */}
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              <span className="label-tech text-primary text-[10px]">Powered by AI</span>
            </div>
            
            {/* User Menu */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden md:inline">
                      {user.email?.split('@')[0]}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/admin')}>
                        <Shield className="mr-2 h-4 w-4" />
                        Admin Dashboard
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/auth')}
              >
                Sign In
              </Button>
            )}
            
            {/* Mobile Menu */}
            {user && (
              <Sheet>
                <SheetTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <div className="flex flex-col gap-4 mt-8">
                    {navLinks.map(link => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        className={({ isActive }) =>
                          `text-lg font-medium p-3 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isActive ? 'bg-primary text-black' : 'hover:bg-muted'
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
