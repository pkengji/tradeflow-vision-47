import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';

export default function SettingsOwner() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'trader' | 'viewer'>('viewer');

  const addUserMutation = useMutation({
    mutationFn: async () => {
      return api.createUser({ username, email, password, role });
    },
    onSuccess: () => {
      toast.success('Benutzer wurde hinzugefügt');
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('viewer');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Fehler beim Hinzufügen des Benutzers');
    },
  });

  const handleAddUser = () => {
    if (!username || !email || !password) {
      toast.error('Bitte alle Felder ausfüllen');
      return;
    }
    if (!email.includes('@')) {
      toast.error('Bitte gültige E-Mail-Adresse eingeben');
      return;
    }
    if (password.length < 8) {
      toast.error('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    addUserMutation.mutate();
  };

  const BackButton = (
    <Link to="/settings">
      <Button variant="ghost" size="icon">
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </Link>
  );

  return (
    <DashboardLayout
      pageTitle="Owneroptionen"
      mobileHeaderLeft={BackButton}
      desktopHeaderLeft={BackButton}
    >
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Benutzer hinzufügen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm">
                Benutzername
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Benutzername eingeben"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm">
                E-Mail
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@beispiel.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Passwort eingeben"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm">
                Rolle
              </Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger id="role" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="trader">Trader</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 bg-card border-t p-4 z-50">
        <Button onClick={handleAddUser} disabled={addUserMutation.isPending} className="w-full">
          {addUserMutation.isPending ? 'Füge hinzu...' : 'User hinzufügen'}
        </Button>
      </div>
    </DashboardLayout>
  );
}
