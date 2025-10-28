import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Analysis from "./pages/Analysis";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import MyAnalyses from "./pages/MyAnalyses";
import Playbooks from "./pages/Playbooks";
import FrameworkDetail from "./pages/FrameworkDetail";
import ReportViewer from "./pages/ReportViewer";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/analyze" element={<Analysis />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/my-analyses" element={<MyAnalyses />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/playbooks/framework/:frameworkId" element={<FrameworkDetail />} />
          <Route path="/playbooks/reports/:reportId" element={<ReportViewer />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
