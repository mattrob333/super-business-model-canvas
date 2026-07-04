import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// Lazy-load all other route components for code splitting
const Canvas = lazy(() => import("./pages/Canvas"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminFrameworks = lazy(() => import("./pages/admin/Frameworks"));
const FrameworkEditor = lazy(() => import("./pages/admin/FrameworkEditor"));
const MyAnalyses = lazy(() => import("./pages/MyAnalyses"));
const Playbooks = lazy(() => import("./pages/Playbooks"));
const FrameworkDetail = lazy(() => import("./pages/FrameworkDetail"));
const ReportViewer = lazy(() => import("./pages/ReportViewer"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CompetitorCanvas = lazy(() => import("./pages/CompetitorCanvas"));
const Gaps = lazy(() => import("./pages/Gaps"));
const Knowledge = lazy(() => import("./pages/Knowledge"));
const Agents = lazy(() => import("./pages/Agents"));
const AgentDetail = lazy(() => import("./pages/AgentDetail"));
const Activity = lazy(() => import("./pages/Activity"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
  </div>
);

const withSuspense = (Component: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

/** Redirects unauthenticated users to /auth for every route in the shell. */
const RequireAuth = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          {/* Public routes — no shell */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />

          {/* Authenticated routes — inside AppShell */}
          <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={withSuspense(Dashboard)} />
            <Route path="/competitors/:competitorId/canvas" element={withSuspense(CompetitorCanvas)} />
            <Route path="/canvas" element={withSuspense(Canvas)} />
            <Route path="/gaps" element={withSuspense(Gaps)} />
            <Route path="/knowledge" element={withSuspense(Knowledge)} />
            <Route path="/agents" element={withSuspense(Agents)} />
            <Route path="/agents/:agentId" element={withSuspense(AgentDetail)} />
            <Route path="/activity" element={withSuspense(Activity)} />
            <Route path="/analyze" element={<Navigate to="/canvas" replace />} />
            <Route path="/my-analyses" element={withSuspense(MyAnalyses)} />
            <Route path="/playbooks" element={withSuspense(Playbooks)} />
            <Route path="/playbooks/framework/:frameworkId" element={withSuspense(FrameworkDetail)} />
            <Route path="/playbooks/reports/:reportId" element={withSuspense(ReportViewer)} />
            <Route path="/admin" element={withSuspense(Admin)} />
            <Route path="/admin/frameworks" element={withSuspense(AdminFrameworks)} />
            <Route path="/admin/frameworks/new" element={withSuspense(FrameworkEditor)} />
            <Route path="/admin/frameworks/:id/edit" element={withSuspense(FrameworkEditor)} />
            <Route path="/settings" element={withSuspense(Settings)} />
          </Route>
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={withSuspense(NotFound)} />
        </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
