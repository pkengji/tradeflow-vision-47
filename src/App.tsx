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
import SignalDetail from "./pages/SignalDetail";
import Settings from './pages/Settings';
import SettingsAccount from './pages/SettingsAccount';
import SettingsNotifications from './pages/SettingsNotifications';
import SettingsTime from './pages/SettingsTime';
import SettingsOwner from './pages/SettingsOwner';
import NotFound from "@/pages/NotFound";
import OutboxPage from "./pages/Outbox";
import TradeDetailPage from "./pages/Index";

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
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trades"
              element={
                <ProtectedRoute>
                  <Trades />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trade/:id"
              element={
                <ProtectedRoute>
                  <TradeDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/signal/:id"
              element={
                <ProtectedRoute>
                  <SignalDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots"
              element={
                <ProtectedRoute>
                  <Bots />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:id"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <BotDetail />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/signals"
              element={
                <ProtectedRoute>
                  <Signals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/account"
              element={
                <ProtectedRoute>
                  <SettingsAccount />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/notifications"
              element={
                <ProtectedRoute>
                  <SettingsNotifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/time"
              element={
                <ProtectedRoute>
                  <SettingsTime />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/owner"
              element={
                <ProtectedRoute>
                  <SettingsOwner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/outbox"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <OutboxPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
