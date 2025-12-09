"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

type AuthContextType = {
  accessToken: string | null;
  userId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  ready: boolean;
  apiFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function fetchWithRefresh(input: RequestInfo, init?: RequestInit, getAccessToken?: () => string | null, setAccessToken?: (t: string | null) => void) {
  // Attach current access token
  const token = getAccessToken ? getAccessToken() : null;
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers, credentials: "include" });
  if (res.status !== 401) return res;

  // Try refresh
  const r = await fetch(`${BACKEND}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!r.ok) return res; // original 401
  const data = await r.json();
  if (data?.access_token && setAccessToken) setAccessToken(data.access_token);

  // Retry original request with new token
  const retryHeaders = new Headers(init?.headers as HeadersInit | undefined);
  if (data?.access_token) retryHeaders.set("Authorization", `Bearer ${data.access_token}`);
  return fetch(input, { ...init, headers: retryHeaders, credentials: "include" });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Try to obtain an access token from refresh cookie on mount
  useEffect(() => {
    let mounted = true;
    async function tryRefresh() {
      try {
        const res = await fetch(`${BACKEND}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.access_token ?? null);
          setUserId(data.user_id ?? null);
          setFullName(data.full_name ?? null);
          setAvatarUrl(data.avatar_url ?? null);
        } else {
          setAccessToken(null);
          setUserId(null);
          setFullName(null);
          setAvatarUrl(null);
        }
      } catch (e) {
        setAccessToken(null);
        setUserId(null);
        setFullName(null);
        setAvatarUrl(null);
      } finally {
        if (mounted) setReady(true);
      }
    }
    tryRefresh();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
        console.log("Attempting login for email:", email);
      const res = await fetch(`${BACKEND}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await res.json();
      console.log("Login response data:", data);
      if (!res.ok) return false;
      setAccessToken(data.access_token ?? null);
      setUserId(data.user_id ?? null);
      setFullName(data.full_name ?? null);
      setAvatarUrl(data.avatar_url ?? null);
      // Expect backend to set refresh token cookie via Set-Cookie
      return true;
    } catch (e) {
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch(`${BACKEND}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (e) {
      // ignore
    }
    setAccessToken(null);
    setUserId(null);
    setFullName(null);
    setAvatarUrl(null);
  };

  const apiFetch = async (input: RequestInfo, init?: RequestInit) => {
    return fetchWithRefresh(input, init, () => accessToken, setAccessToken);
  };

  return (
    <AuthContext.Provider
      value={{ accessToken, userId, fullName, avatarUrl, login, logout, ready, apiFetch }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { fetchWithRefresh };
