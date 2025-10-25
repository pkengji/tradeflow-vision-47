import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsAccount() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSave = () => {
    // TODO: API call to save profile/password
    toast.success('Einstellungen gespeichert');
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
          <h1 className="text-[var(--font-size-page-title)] font-semibold">Konto & Sicherheit</h1>
        </div>
      </header>

        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Profil</CardTitle>
              <CardDescription className="text-xs">Ihre persönlichen Informationen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Name</Label>
                <Input id="name" defaultValue={user?.name ?? ''} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">E-Mail</Label>
                <Input id="email" type="email" defaultValue={user?.email ?? ''} disabled className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="role" className="text-xs">Rolle</Label>
                <Input id="role" defaultValue={user?.role ?? ''} disabled className="text-sm" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Passwort ändern</CardTitle>
              <CardDescription className="text-xs">Aktualisieren Sie Ihr Passwort</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="current-password" className="text-xs">Aktuelles Passwort</Label>
                <Input id="current-password" type="password" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password" className="text-xs">Neues Passwort</Label>
                <Input id="new-password" type="password" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password" className="text-xs">Passwort bestätigen</Label>
                <Input id="confirm-password" type="password" className="text-sm" />
              </div>
            </CardContent>
          </Card>
        </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleSave} className="w-full">
          Speichern
        </Button>
      </div>
    </div>
  );
}
