import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, ApiError, PublicUser } from "../lib/api";

const TOKEN_KEY = "ai-mentor:token";

type AuthState = {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    phoneNumber?: string
  ) => Promise<{ email: string }>;
  verifyOtp: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string) => Promise<{ message: string }>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<PublicUser | null>(null);
  // Starts true whenever a stored token needs to be verified against /auth/me.
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .me(token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        // Stored token is invalid or expired — clear it silently.
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  function persistSession(session: { user: PublicUser; token: string }) {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(session.user);
  }

  async function login(email: string, password: string) {
    const session = await api.login({ email, password });
    persistSession(session);
  }

  // No longer auto-logs-in — account isn't usable until the OTP is verified.
  async function register(name: string, email: string, password: string, phoneNumber?: string) {
    const result = await api.register({ name, email, password, phoneNumber });
    return { email: result.email };
  }

  async function verifyOtp(email: string, code: string) {
    const session = await api.verifyOtp({ email, code });
    persistSession(session);
  }

  async function resendOtp(email: string) {
    return api.resendOtp({ email });
  }

  function logout() {
    if (token) api.logout(token).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, verifyOtp, resendOtp, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
