import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

// Liste der gängigen Zeitzonen mit UTC-Offset
const TIMEZONES = [
  { value: 'UTC', label: 'UTC +0:00' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC +1:00)' },
  { value: 'Europe/Zurich', label: 'Europe/Zurich (UTC +1:00)' },
  { value: 'Europe/Vienna', label: 'Europe/Vienna (UTC +1:00)' },
  { value: 'Europe/London', label: 'Europe/London (UTC +0:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC +1:00)' },
  { value: 'America/New_York', label: 'America/New_York (UTC -5:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC -8:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC -6:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC +9:00)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC +8:00)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC +8:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC +8:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC +10:00)' },
];

export default function SettingsTime() {
  const navigate = useNavigate();
  const [useSystemTime, setUseSystemTime] = useState(true);
  const [selectedTimezone, setSelectedTimezone] = useState('Europe/Zurich');

  const timezoneMutation = useMutation({
    mutationFn: async () => {
      return api.updateTimezone({
        use_system: useSystemTime,
        timezone: useSystemTime ? undefined : selectedTimezone,
      });
    },
    onSuccess: () => {
      toast.success('Zeiteinstellungen gespeichert');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Fehler beim Speichern');
    },
  });

  const handleSave = () => {
    timezoneMutation.mutate();
  };

  return (
    <DashboardLayout pageTitle="Zeit" showBackButton>
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Zeitzone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="system-time"
                checked={useSystemTime}
                onCheckedChange={(checked) => setUseSystemTime(checked as boolean)}
              />
              <Label htmlFor="system-time" className="text-sm">
                Systemeinstellungen verwenden
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone" className="text-sm">
                Zeitzone auswählen
              </Label>
              <Select
                value={selectedTimezone}
                onValueChange={setSelectedTimezone}
                disabled={useSystemTime}
              >
                <SelectTrigger id="timezone" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleSave} disabled={timezoneMutation.isPending} className="w-full">
          {timezoneMutation.isPending ? 'Speichern...' : 'Speichern'}
        </Button>
      </div>
    </DashboardLayout>
  );
}
