"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

const TOKEN_KEY = "clawcommerce_token";
const REFRESH_TOKEN_KEY = "clawcommerce_refresh_token";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function authRequest<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.message || body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setToken(null);
    setUser(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    // Refresh 60 seconds before expiry
    const refreshMs = Math.max((expiresIn - 60) * 1000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return;

      try {
        const data = await authRequest<AuthResponse>("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });

        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
        setToken(data.token);
        scheduleRefresh(data.expiresIn);
      } catch {
        // Refresh failed — force logout
        clearAuth();
        router.push("/login");
      }
    }, refreshMs);
  }, [clearAuth, router]);

  const saveAuth = useCallback((data: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    setToken(data.token);
    setUser(data.user);
    scheduleRefresh(data.expiresIn);
  }, [scheduleRefresh]);

  const fetchUser = useCallback(
    async (jwt: string): Promise<User> => {
      const data = await authRequest<{ user: User }>("/auth/me", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      return data.user;
    },
    []
  );

  // On mount, validate existing token or refresh
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    const refreshStored = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!stored) {
      setIsLoading(false);
      return;
    }

    setToken(stored);
    fetchUser(stored)
      .then((u) => {
        setUser(u);
        // Schedule refresh based on remaining time (assume 15 min tokens, refresh at 14 min)
        scheduleRefresh(14 * 60);
      })
      .catch(async () => {
        // Access token expired — try refresh
        if (refreshStored) {
          try {
            const data = await authRequest<AuthResponse>("/auth/refresh", {
              method: "POST",
              body: JSON.stringify({ refreshToken: refreshStored }),
            });
            saveAuth(data);
          } catch {
            clearAuth();
          }
        } else {
          clearAuth();
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [fetchUser, clearAuth, scheduleRefresh, saveAuth]);

  const login = async (email: string, password: string) => {
    const data = await authRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveAuth(data);
  };

  const register = async (
    email: string,
    name: string,
    password: string
  ) => {
    const data = await authRequest<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, name, password }),
    });
    saveAuth(data);
  };

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    // Revoke refresh token on server
    if (refreshToken) {
      try {
        await authRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* best effort */ }
    }
    clearAuth();
    router.push("/login");
  }, [clearAuth, router]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
