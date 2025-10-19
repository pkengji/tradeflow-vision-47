import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "@/pages/Dashboard";
import Trades from "./pages/Trades";
import TradeDetail from "./pages/TradeDetail";
import Bots from "@/pages/Bots";
import BotDetail from "./pages/BotDetail";
import Signals from "./pages/Signals";
import Settings from "./pages/Settings";
import NotFound from "@/pages/NotFound";
import OutboxPage from "./pages/Outbox";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/" element={<Dashboard />}
            />
            <Route
              path="/trades"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Trades />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/trades/:id"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <TradeDetail />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots" element={<Bots />}
            />
            <Route path="/bots/:id" element={<BotDetail />} />
            <Route
              path="/signals"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Signals />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Settings />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
            <Route path="/outbox" element={<OutboxPage />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
