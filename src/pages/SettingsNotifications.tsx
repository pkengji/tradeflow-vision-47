import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

type NotificationEvent = 
  | 'trade_opened' 
  | 'trade_won' 
  | 'trade_lost' 
  | 'tp_sl_changed' 
  | 'trade_not_opened';

type NotificationSettings = {
  [key in NotificationEvent]: {
    email: boolean;
    push: boolean;
  };
};

const EVENT_LABELS: Record<NotificationEvent, string> = {
  trade_opened: 'Trade geöffnet',
  trade_won: 'Trade gewonnen',
  trade_lost: 'Trade verloren',
  tp_sl_changed: 'TP/SL geändert',
  trade_not_opened: 'Trade nicht geöffnet',
};

export default function SettingsNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [settings, setSettings] = useState<NotificationSettings>({
    trade_opened: { email: true, push: true },
    trade_won: { email: true, push: true },
    trade_lost: { email: true, push: true },
    tp_sl_changed: { email: false, push: true },
    trade_not_opened: { email: true, push: false },
  });

  // TODO: Fetch settings from API
  const { data: savedSettings } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      // Placeholder - replace with actual API call
      return settings;
    },
  });

  useEffect(() => {
    if (savedSettings) {
      setSettings(savedSettings);
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      // TODO: Save to backend
      await new Promise(resolve => setTimeout(resolve, 500));
      return newSettings;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Benachrichtigungseinstellungen gespeichert');
    },
  });

  const handleToggle = (event: NotificationEvent, type: 'email' | 'push') => {
    setSettings(prev => ({
      ...prev,
      [event]: {
        ...prev[event],
        [type]: !prev[event][type],
      },
    }));
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="flex h-14 items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-[var(--font-size-page-title)] font-semibold">Benachrichtigungen</h1>
        </div>
      </header>

        <div className="flex-1 overflow-y-auto p-4 pb-24">
          <Card>
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex items-center border-b px-4 py-3">
                <div className="flex-1 text-sm font-medium">Ereignis</div>
                <div className="w-16 text-center text-sm font-medium">E-Mail</div>
                <div className="w-16 text-center text-sm font-medium">Push</div>
              </div>

              {/* Events */}
              {Object.entries(EVENT_LABELS).map(([event, label]) => (
                <div
                  key={event}
                  className="flex items-center border-b last:border-b-0 px-4 py-3"
                >
                  <div className="flex-1 text-sm">{label}</div>
                  <div className="w-16 flex justify-center">
                    <Checkbox
                      checked={settings[event as NotificationEvent].email}
                      onCheckedChange={() => handleToggle(event as NotificationEvent, 'email')}
                    />
                  </div>
                  <div className="w-16 flex justify-center">
                    <Checkbox
                      checked={settings[event as NotificationEvent].push}
                      onCheckedChange={() => handleToggle(event as NotificationEvent, 'push')}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="mt-4 text-xs text-muted-foreground px-1">
            Push-Benachrichtigungen werden pro Ereignis gruppiert
          </div>
        </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Speichern...' : 'Speichern'}
        </Button>
      </div>
    </div>
  );
}
