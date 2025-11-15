import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import api from '@/lib/api';

export type Role = 'admin' | 'trader';
export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Check if user is already logged in via cookie
    const checkAuth = async () => {
      try {
        const userData = await api.getMe();
        // getMe returns user object directly (not wrapped in {ok, user})
        setUser({
          id: userData.id,
          email: userData.email,
          username: userData.username,
          role: userData.role === 'admin' ? 'admin' : 'trader',
        });
      } catch (error) {
        // Not logged in
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    const response = await api.login({ username, password });
    if (response.ok && response.user) {
      setUser({
        id: response.user.id,
        email: response.user.email,
        username: response.user.username,
        role: response.user.role === 'admin' ? 'admin' : 'trader',
      });
    } else {
      throw new Error('Login fehlgeschlagen');
    }
  };

  const logout = async () => {
    await api.logout();
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
