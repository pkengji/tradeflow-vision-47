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
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export default function SettingsAccount() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const profileMutation = useMutation({
    mutationFn: async () => {
      if (name !== user?.name) {
        await api.updateUserProfile({ name });
      }
      if (currentPassword && newPassword) {
        if (newPassword !== confirmPassword) {
          throw new Error('Passwörter stimmen nicht überein');
        }
        await api.updateUserPassword({ current_password: currentPassword, new_password: newPassword });
      }
    },
    onSuccess: () => {
      toast.success('Einstellungen gespeichert');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Fehler beim Speichern');
    },
  });

  const handleSave = () => {
    profileMutation.mutate();
  };

  return (
    <DashboardLayout pageTitle="Konto & Sicherheit" showBackButton>
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Profil</CardTitle>
            <CardDescription className="text-xs">Ihre persönlichen Informationen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
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
              <Input 
                id="current-password" 
                type="password" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="text-sm" 
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-password" className="text-xs">Neues Passwort</Label>
              <Input 
                id="new-password" 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="text-sm" 
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password" className="text-xs">Passwort bestätigen</Label>
              <Input 
                id="confirm-password" 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="text-sm" 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleSave} disabled={profileMutation.isPending} className="w-full">
          {profileMutation.isPending ? 'Speichern...' : 'Speichern'}
        </Button>
      </div>
    </DashboardLayout>
  );
}
