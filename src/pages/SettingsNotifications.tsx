import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  subscribeToPushManager,
  getPushSubscription,
  isPushSupported,
  getNotificationPermission,
  isVapidKeyConfigured,
} from '@/lib/pushNotifications';

type NotificationEvent = 
  | 'trade_opened' 
  | 'trade_won' 
  | 'trade_lost' 
  | 'sltp_changed' 
  | 'trade_failed'
  | 'system_alerts';

const EVENT_LABELS: Record<NotificationEvent, string> = {
  trade_opened: 'Trade geöffnet',
  trade_won: 'Trade gewonnen',
  trade_lost: 'Trade verloren',
  sltp_changed: 'TP/SL geändert',
  trade_failed: 'Trade nicht geöffnet',
  system_alerts: 'System Meldungen',
};

type NotificationSettings = {
  [key in NotificationEvent]: {
    email: boolean;
    push: boolean;
  };
};

export default function SettingsNotifications() {
  const qc = useQueryClient();

  const [settings, setSettings] = useState<NotificationSettings>({
    trade_opened: { email: false, push: true },
    trade_won: { email: false, push: true },
    trade_lost: { email: false, push: true },
    sltp_changed: { email: false, push: false },
    trade_failed: { email: true, push: true },
    system_alerts: { email: true, push: true },
  });

  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);

  // Fetch settings from API
  const { data: savedSettings, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: api.getNotificationSettings,
  });

  // Check push notification support and status
  useEffect(() => {
    const checkPushStatus = async () => {
      const supported = isPushSupported();
      const configured = isVapidKeyConfigured();
      
      setPushSupported(supported);
      setVapidConfigured(configured);
      setNotificationPermission(getNotificationPermission());

      if (supported && configured) {
        const subscription = await getPushSubscription();
        setPushSubscribed(!!subscription);
      }
    };

    checkPushStatus();
  }, []);

  useEffect(() => {
    if (savedSettings) {
      // Transform backend format to frontend format
      setSettings({
        trade_opened: {
          email: savedSettings.trade_opened_email,
          push: savedSettings.trade_opened_push,
        },
        trade_won: {
          email: savedSettings.trade_won_email,
          push: savedSettings.trade_won_push,
        },
        trade_lost: {
          email: savedSettings.trade_lost_email,
          push: savedSettings.trade_lost_push,
        },
        sltp_changed: {
          email: savedSettings.sltp_changed_email,
          push: savedSettings.sltp_changed_push,
        },
        trade_failed: {
          email: savedSettings.trade_failed_email,
          push: savedSettings.trade_failed_push,
        },
        system_alerts: {
          email: savedSettings.system_alerts_email,
          push: savedSettings.system_alerts_push,
        },
      });
    }
  }, [savedSettings]);

  const saveMutation = useMutation({
    mutationFn: async (newSettings: NotificationSettings) => {
      // Transform frontend format to backend format
      const backendSettings = {
        trade_opened_push: newSettings.trade_opened.push,
        trade_opened_email: newSettings.trade_opened.email,
        trade_won_push: newSettings.trade_won.push,
        trade_won_email: newSettings.trade_won.email,
        trade_lost_push: newSettings.trade_lost.push,
        trade_lost_email: newSettings.trade_lost.email,
        sltp_changed_push: newSettings.sltp_changed.push,
        sltp_changed_email: newSettings.sltp_changed.email,
        trade_failed_push: newSettings.trade_failed.push,
        trade_failed_email: newSettings.trade_failed.email,
        system_alerts_push: newSettings.system_alerts.push,
        system_alerts_email: newSettings.system_alerts.email,
      };
      return api.updateNotificationSettings(backendSettings);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success('Benachrichtigungseinstellungen gespeichert');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Fehler beim Speichern');
    },
  });

  const handleToggle = async (event: NotificationEvent, type: 'email' | 'push') => {
    const newValue = !settings[event][type];
    
    setSettings(prev => ({
      ...prev,
      [event]: {
        ...prev[event],
        [type]: newValue,
      },
    }));

    // If enabling push for any event and not subscribed yet, trigger subscription
    if (type === 'push' && newValue && !pushSubscribed) {
      try {
        await handlePushSubscribe();
      } catch (error) {
        // Revert the toggle if subscription failed
        setSettings(prev => ({
          ...prev,
          [event]: {
            ...prev[event],
            [type]: false,
          },
        }));
      }
    }
  };

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const handlePushSubscribe = async () => {
    if (!pushSupported) {
      toast.error('Push-Benachrichtigungen werden nicht unterstützt');
      return;
    }

    if (!vapidConfigured) {
      toast.error('VAPID Key ist nicht konfiguriert');
      return;
    }

    try {
      toast.loading('Push-Benachrichtigungen werden aktiviert...');
      
      // Subscribe to push manager
      const subscription = await subscribeToPushManager();
      
      // Send subscription to backend
      await api.subscribeToPush(subscription.toJSON());
      
      setPushSubscribed(true);
      setNotificationPermission('granted');
      toast.dismiss();
      toast.success('Push-Benachrichtigungen aktiviert');
    } catch (error: any) {
      toast.dismiss();
      console.error('Push subscription failed:', error);
      toast.error(error.message || 'Fehler beim Aktivieren der Push-Benachrichtigungen');
      throw error;
    }
  };

  const BackButton = (
    <Link to="/settings">
      <Button variant="ghost" size="icon">
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </Link>
  );

  const getPushStatusText = () => {
    if (!pushSupported) return 'Nicht unterstützt';
    if (!vapidConfigured) return 'Nicht konfiguriert';
    if (notificationPermission === 'denied') return 'Blockiert';
    if (pushSubscribed) return 'Aktiviert';
    return 'Nicht aktiviert';
  };

  const getPushStatusColor = () => {
    if (!pushSupported || !vapidConfigured || notificationPermission === 'denied') return 'text-danger';
    if (pushSubscribed) return 'text-success';
    return 'text-muted-foreground';
  };

  return (
    <DashboardLayout
      pageTitle="Benachrichtigungen"
      mobileHeaderLeft={BackButton}
      desktopHeaderLeft={BackButton}
    >
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* Push Status Card */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {pushSubscribed ? (
                  <Bell className="h-5 w-5 text-success" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <div className="font-medium">Push-Benachrichtigungen</div>
                  <div className={`text-sm ${getPushStatusColor()}`}>
                    {getPushStatusText()}
                  </div>
                </div>
              </div>
              {pushSupported && vapidConfigured && !pushSubscribed && notificationPermission !== 'denied' && (
                <Button onClick={handlePushSubscribe} size="sm">
                  Aktivieren
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center border-b px-4 py-3">
              <div className="flex-1 text-sm font-medium">Ereignis</div>
              <div className="w-16 text-center text-sm font-medium">E-Mail</div>
              <div className="w-16 text-center text-sm font-medium">Push</div>
            </div>

            {isLoading ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Lade Einstellungen...
              </div>
            ) : (
              Object.entries(EVENT_LABELS).map(([event, label]) => (
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
              ))
            )}
          </CardContent>
        </Card>

        <div className="mt-4 text-xs text-muted-foreground px-1">
          Push-Benachrichtigungen werden pro Ereignis gruppiert
        </div>
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? 'Speichern...' : 'Speichern'}
        </Button>
      </div>
    </DashboardLayout>
  );
}
