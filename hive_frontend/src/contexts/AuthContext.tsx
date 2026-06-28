import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

export interface AuthUser {
  id: number;
  email: string;
  role: 'super_admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  login: (token: string, user?: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'hive_token';
const USER_KEY = 'hive_user';

// Set auth header immediately at module load so child components can make
// authenticated requests in their first useEffect (before the AuthProvider's
// own useEffect runs).
const _initialToken = localStorage.getItem(TOKEN_KEY);
if (_initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${_initialToken}`;
}

const readUser = (): AuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(readUser());

  const login = (newToken: string, newUser?: AuthUser) => {
    setToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    if (newUser) {
      setUser(newUser);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    }
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete axios.defaults.headers.common['Authorization'];
  }, []);

  // Sync axios header with current token and install a 401 interceptor.
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          const url: string = error.config?.url ?? '';
          if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
            logout();
            if (window.location.pathname !== '/login') {
              window.location.assign('/login');
            }
          }
        }
        return Promise.reject(error);
      },
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, [token, logout]);

  // Refresh user profile if we have a token but no cached user (e.g. after a
  // logout-on-401 storm). Best-effort: failure just leaves user null.
  useEffect(() => {
    if (token && !user) {
      axios.get(`${API_URL}/auth/me`)
        .then((r) => {
          setUser(r.data);
          localStorage.setItem(USER_KEY, JSON.stringify(r.data));
        })
        .catch(() => {});
    }
  }, [token, user]);

  const isAuthenticated = !!token;
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated, isSuperAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
