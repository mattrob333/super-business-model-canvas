import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Landing from "./pages/Landing";
import Analysis from "./pages/Analysis";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import AdminFrameworks from "./pages/admin/Frameworks";
import FrameworkEditor from "./pages/admin/FrameworkEditor";
import MyAnalyses from "./pages/MyAnalyses";
import Playbooks from "./pages/Playbooks";
import FrameworkDetail from "./pages/FrameworkDetail";
import ReportViewer from "./pages/ReportViewer";
import Dashboard from "./pages/Dashboard";
import Canvas from "./pages/Canvas";
import Gaps from "./pages/Gaps";
import Knowledge from "./pages/Knowledge";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes — no shell */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />

          {/* Authenticated routes — inside AppShell */}
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/gaps" element={<Gaps />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/analyze" element={<Analysis />} />
            <Route path="/my-analyses" element={<MyAnalyses />} />
            <Route path="/playbooks" element={<Playbooks />} />
            <Route path="/playbooks/framework/:frameworkId" element={<FrameworkDetail />} />
            <Route path="/playbooks/reports/:reportId" element={<ReportViewer />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/frameworks" element={<AdminFrameworks />} />
            <Route path="/admin/frameworks/new" element={<FrameworkEditor />} />
            <Route path="/admin/frameworks/:id/edit" element={<FrameworkEditor />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
