import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsAccount() {
  const navigate = useNavigate();

  const handleSave = () => {
    toast.success('Einstellungen gespeichert');
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
          <h1 className="text-base font-semibold">Konto & Sicherheit</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Profil</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Profilinformationen bearbeiten (Wird später implementiert)
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Passwort ändern</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Passwort ändern (Wird später implementiert)
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
