"use client";

import { useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Bot, Lock, User, Shield } from "lucide-react";

/**
 * Paden waar AuthGate wordt overgeslagen. De klant opent een offerte-link
 * zonder account — de server valideert het opaque token zelf.
 *
 * Beide vormen meenemen: op accounting.novactrl.nl rewrite middleware
 * intern naar /accounting/quote-accept/... maar usePathname() retourneert
 * de URL-bar-versie /quote-accept/...
 */
const PUBLIC_PATH_PREFIXES = [
  "/quote-accept",
  "/quote-accept",
  "/invoice-view",
  "/invoice-view",
  // Mollie stuurt gebruiker terug naar /accounting/invoices/[id]/payment-return
  // na iDEAL-flow — klant heeft geen Nova login.
  "/payment-return",
];

interface AuthUser {
  username: string;
  role: string;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_PATH_PREFIXES.some((p) =>
    pathname?.startsWith(p),
  );
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [step, setStep] = useState<"login" | "2fa">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPublicRoute) return; // public pages slaan auth-check over
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setAuthed(true);
          setUser(d.user);
        } else {
          setAuthed(false);
        }
      })
      .catch(() => setAuthed(false));
  }, [isPublicRoute]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Inloggen mislukt");
        return;
      }

      if (data.requires2fa) {
        setStep("2fa");
        setTotpCode("");
        return;
      }

      setAuthed(true);
      setUser(data.user);
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ongeldige code");
        return;
      }

      setAuthed(true);
      setUser(data.user);
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthed(false);
    setUser(null);
    setStep("login");
    setUsername("");
    setPassword("");
    setTotpCode("");
  }

  if (isPublicRoute) {
    // Geen auth-check, geen context-provider — publieke pagina rendert zelf.
    return <>{children}</>;
  }

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-zinc-500">Laden...</div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 w-96 shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 justify-center mb-6">
            <Bot className="w-8 h-8 text-indigo-400" />
            <div>
              <h1 className="text-lg font-bold text-zinc-100">Nova</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Control
              </p>
            </div>
          </div>

          {step === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {/* H16: each input now has a proper <label htmlFor> (sr-only so
                  visual design is unchanged) so screen readers & password
                  managers identify fields correctly. */}
              <div className="relative">
                <label htmlFor="login-username" className="sr-only">Gebruikersnaam</label>
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  placeholder="Gebruikersnaam"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div className="relative">
                <label htmlFor="login-password" className="sr-only">Wachtwoord</label>
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Bezig..." : "Inloggen"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify2fa} className="space-y-4">
              <div className="text-center mb-2">
                <Shield className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-300">Twee-factor authenticatie</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Voer de code uit je authenticator app in
                </p>
              </div>
              <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm text-center font-mono tracking-[0.5em] focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                  maxLength={6}
                  autoComplete="one-time-code"
                />
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Verifiëren..." : "Verifiëren"}
              </button>
              <button
                type="button"
                onClick={() => { setStep("login"); setError(""); }}
                className="w-full py-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
              >
                Terug naar inloggen
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

import { createContext, useContext } from "react";

interface AuthContextType {
  user: AuthUser | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, logout: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}
