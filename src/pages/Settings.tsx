import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, User, Bell, Clock, Shield, Wallet, Droplets } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type SettingsOption = {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  ownerOnly?: boolean;
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const settingsOptions: SettingsOption[] = [
    {
      id: 'account',
      label: 'Konto & Sicherheit',
      icon: <User className="w-5 h-5" />,
      path: '/settings/account',
    },
    {
      id: 'notifications',
      label: 'Benachrichtigungen',
      icon: <Bell className="w-5 h-5" />,
      path: '/settings/notifications',
    },
    {
      id: 'payments',
      label: 'Zahlungen',
      icon: <Wallet className="w-5 h-5" />,
      path: '/settings/payments',
    },
    {
      id: 'time',
      label: 'Zeit',
      icon: <Clock className="w-5 h-5" />,
      path: '/settings/time',
    },
    {
      id: 'liquidity',
      label: 'Liquiditätstracker',
      icon: <Droplets className="w-5 h-5" />,
      path: '/settings/liquidity',
    },
    {
      id: 'owner',
      label: 'Owneroptionen',
      icon: <Shield className="w-5 h-5" />,
      path: '/settings/owner',
      ownerOnly: true,
    },
  ];

  const visibleOptions = settingsOptions.filter(
    option => !option.ownerOnly || user?.role === 'admin'
  );

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <DashboardLayout pageTitle="Einstellungen">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3">
          {visibleOptions.map((option) => (
            <Card
              key={option.id}
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate(option.path)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {option.icon}
                  <span className="text-sm font-medium">{option.label}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Card>
          ))}

          <Card className="p-4 mt-6">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleLogout}
            >
              Abmelden
            </Button>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
