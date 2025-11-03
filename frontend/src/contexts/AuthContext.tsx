import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

export type Role = 'admin' | 'trader';
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

/** Eigener Init-Typ: erlaubt Objekt-Bodies, typisierte Header */
type HttpInit = Omit<RequestInit, 'body' | 'headers'> & {
  body?: any;
  headers?: Record<string, string>;
};

/** Allgemeiner HTTP-Helper (Objekt-Bodies werden automatisch JSON-stringifiziert) */
async function http<T = any>(path: string, init: HttpInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  };

  let body = init.body;
  if (
    body !== undefined &&
    typeof body !== 'string' &&
    headers['Content-Type']?.includes('application/json')
  ) {
    body = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    method: init.method ?? 'GET',
    credentials: 'include',
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }

  if (res.status === 204) return null as unknown as T;

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  const text = await res.text();
  return text as unknown as T;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Session beim App-Start laden (Cookie-basiert)
  useEffect(() => {
    (async () => {
      try {
        // Prüfen, ob Session-Cookie valide ist
        await http<{ user_id: number }>('/api/v1/auth/whoami');

        // Profil laden
        const me = await http<{
          id: number;
          email: string | null;
          username: string | null;
          role?: string | null;
        }>('/api/v1/me');

        setUser({
          id: String(me.id),
          email: me.email || '',
          name: me.username || me.email || `user#${me.id}`,
          role: (me.role === 'admin' ? 'admin' : 'trader') as Role,
        });
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Login per E-Mail + Passwort
  const login = async (email: string, password: string) => {
    // Falls dein Backend auf { username, password } besteht → diese Zeile umstellen:
    // const payload: { username: string; password: string } = { username: email, password };
    const payload: { email: string; password: string } = { email, password };

    const data = await http<{
      ok: boolean;
      user: { id: number; email: string | null; username: string | null; role?: string | null };
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: payload, // <-- jetzt typkorrekt
    });

    setUser({
      id: String(data.user.id),
      email: data.user.email || '',
      name: data.user.username || data.user.email || `user#${data.user.id}`,
      role: (data.user.role === 'admin' ? 'admin' : 'trader') as Role,
    });
  };

  // Logout (optional: Server löscht Cookie)
  const logout = async () => {
    try {
      await http('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // falls Route noch nicht existiert: ignorieren
    }
    setUser(null);
  };

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      login,
      logout,
      isAuthenticated: !!user,
      isLoading,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
