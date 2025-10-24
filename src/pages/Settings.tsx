// src/pages/Settings.tsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useNavigate } from 'react-router-dom';

// ---- Zeitzone (Anzeige-Prefs) ----
function PreferredTZ() {
  const [tz, setTz] = useState('Europe/Zurich');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Prefs laden
    (async () => {
      try {
        const prefs = await apiRequest<{ preferred_tz?: string }>('/api/v1/me/preferences');
        if (prefs?.preferred_tz) setTz(prefs.preferred_tz);
      } catch {
        // falls Endpoint (noch) leer: default TZ
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/v1/me/preferences', {
        method: 'PUT',
        body: { preferred_tz: tz, notifications: {} },
      });
      alert('Zeitzone gespeichert: ' + tz);
    } catch (e: any) {
      alert('Fehler beim Speichern: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zeitzone</CardTitle>
        <CardDescription>Anzeige-TZ für UI & KPIs</CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-2">
        <div className="space-y-1">
          <Label>Bevorzugte Zeitzone</Label>
          <select
            className="border rounded px-2 py-1"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
          >
            <option value="Europe/Zurich">Europe/Zurich</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Speichere…' : 'Speichern'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---- User anlegen (Owner) ----
function AddUserForm() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',
    role: 'user' as 'user' | 'owner',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password2) { alert('Passwörter stimmen nicht überein'); return; }
    setSaving(true);
    try {
      await apiRequest('/api/v1/users', {
        method: 'POST',
        body: {
          username: form.username,
          email: form.email,
          password: form.password,
          role: form.role,
        },
      });
      alert('User angelegt.');
      setForm({ username: '', email: '', password: '', password2: '', role: 'user' });
    } catch (e: any) {
      alert('Fehler: ' + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User hinzufügen</CardTitle>
        <CardDescription>Nur Owner: legt neue Nutzer an</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                placeholder="Username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>E-Mail</Label>
              <Input
                placeholder="E-Mail"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Initialpasswort</Label>
              <Input
                type="password"
                placeholder="Initialpasswort"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Passwort bestätigen</Label>
              <Input
                type="password"
                placeholder="Passwort bestätigen"
                value={form.password2}
                onChange={(e) => setForm({ ...form, password2: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>User Type</Label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'user' | 'owner' })}
              >
                <option value="user">User</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>
          <Button disabled={saving} type="submit">
            {saving ? 'Speichere…' : 'Speichern'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <DashboardLayout pageTitle="Einstellungen">
      <div className="space-y-4 p-4 pb-24">
        {/* Präferenzen & User-Anlage */}
        <div className="grid gap-4 md:grid-cols-2">
          <PreferredTZ />
          <AddUserForm />
        </div>

        {/* Optional: Profil & Passwort ändern (statisch/Stub) */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Profil</CardTitle>
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
              <Button disabled size="sm">Profil aktualisieren</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Passwort ändern</CardTitle>
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
              <Button disabled size="sm">Passwort ändern</Button>
            </CardContent>
          </Card>
        </div>

        {/* Logout */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Logout</CardTitle>
            <CardDescription className="text-xs">Von Ihrem Konto abmelden</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLogout} variant="destructive" size="sm">
              Abmelden
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
