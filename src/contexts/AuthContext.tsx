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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        const u: User = JSON.parse(savedUser);
        setUser({ ...u, role: 'admin' });
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, _password: string) => {
    // Replace with real API call later
    const mock: User = { id: '1', email, name: 'Owner', role: 'admin' };
    localStorage.setItem('auth_token', 'mock-token');
    localStorage.setItem('user', JSON.stringify(mock));
    setUser(mock);
  };

  const logout = async () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
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
