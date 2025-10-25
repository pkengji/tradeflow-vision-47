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

// Liste der gängigen Zeitzonen
const TIMEZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Australia/Sydney',
];

export default function SettingsTime() {
  const navigate = useNavigate();
  const [useSystemTime, setUseSystemTime] = useState(true);
  const [selectedTimezone, setSelectedTimezone] = useState('Europe/Zurich');

  const handleSave = () => {
    // TODO: Speichern via API
    toast.success('Zeiteinstellungen gespeichert');
  };

  return (
    <DashboardLayout pageTitle="">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold">Zeit</h1>
        </div>

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
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-50">
          <Button onClick={handleSave} className="w-full">
            Speichern
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
