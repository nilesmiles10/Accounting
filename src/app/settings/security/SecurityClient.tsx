"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Shield, ShieldCheck, ShieldOff, Check, Key } from "lucide-react";

interface Me {
  id: string;
  username: string;
  email: string | null;
  role: string;
  totpEnabled: boolean;
}

export default function SecurityClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 2FA enrollment state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);

  // Password change state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  async function loadMe() {
    setLoading(true);
    const r = await fetch("/api/auth/me");
    const d = await r.json();
    if (r.ok) setMe(d.user);
    else setErr(d.error || "Kon profiel niet laden");
    setLoading(false);
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function startEnrollment() {
    setErr("");
    setEnrollBusy(true);
    try {
      const r = await fetch("/api/auth/2fa/setup", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Setup mislukt");
        return;
      }
      setQrCode(d.qrCode);
      setSecret(d.secret);
    } finally {
      setEnrollBusy(false);
    }
  }

  async function confirmEnrollment() {
    setErr("");
    setEnrollBusy(true);
    try {
      const r = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode, action: "enable" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Verkeerde code");
        return;
      }
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");
      await loadMe();
    } finally {
      setEnrollBusy(false);
    }
  }

  async function disable2fa() {
    if (
      !confirm(
        "2FA uitschakelen? Daarna kun je inloggen met alleen je wachtwoord — minder veilig.",
      )
    )
      return;
    setEnrollBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/2fa/setup", { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Uitschakelen mislukt");
        return;
      }
      await loadMe();
    } finally {
      setEnrollBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr("");
    setPwMsg("");
    if (newPw !== newPw2) {
      setPwErr("Nieuwe wachtwoorden komen niet overeen");
      return;
    }
    if (newPw.length < 12) {
      setPwErr("Minstens 12 tekens");
      return;
    }
    setPwBusy(true);
    try {
      const r = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPw,
          new_password: newPw,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setPwErr(d.error || "Mislukt");
        return;
      }
      setPwMsg("Wachtwoord gewijzigd");
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
    } finally {
      setPwBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Laden…</p>;
  }
  if (!me) {
    return <p className="text-sm text-red-300">{err || "Niet ingelogd"}</p>;
  }

  return (
    <div className="space-y-6">
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 inline-flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Twee-factor authenticatie
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Tweede factor via Authenticator-app (Google Authenticator,
              1Password, Authy, Bitwarden). Voorkomt inlog ook al lekt je
              wachtwoord.
            </p>
          </div>
          {me.totpEnabled ? (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-emerald-500/15 text-emerald-300 rounded">
              <ShieldCheck className="w-3.5 h-3.5" />
              Actief
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-amber-500/15 text-amber-300 rounded">
              <ShieldOff className="w-3.5 h-3.5" />
              Uit
            </span>
          )}
        </div>

        {me.totpEnabled && (
          <button
            onClick={disable2fa}
            disabled={enrollBusy}
            className="text-xs text-red-300 hover:text-red-200 underline"
          >
            2FA uitschakelen
          </button>
        )}

        {!me.totpEnabled && !qrCode && (
          <button
            onClick={startEnrollment}
            disabled={enrollBusy}
            className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            <Shield className="w-4 h-4" />
            2FA inschakelen
          </button>
        )}

        {qrCode && (
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-zinc-400">
              <b>1.</b> Scan de QR-code met je Authenticator-app.{" "}
              <b>2.</b> Voer de 6-cijferige code in om te bevestigen.
            </p>
            <div className="flex gap-4 items-start">
              <Image
                src={qrCode}
                alt="2FA QR code"
                width={180}
                height={180}
                className="bg-white p-2 rounded"
              />
              <div className="flex-1 space-y-2 text-xs text-zinc-500">
                <p>Of voer handmatig deze code in:</p>
                <code className="block bg-zinc-900 border border-zinc-700 px-2 py-1.5 rounded font-mono break-all">
                  {secret}
                </code>
                <p>
                  Bewaar de code op een veilige plek — als je je
                  authenticator-toestel verliest is de admin de enige die
                  je weer kan resetten.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={(e) =>
                  setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="w-32 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-center font-mono text-zinc-200"
              />
              <button
                onClick={confirmEnrollment}
                disabled={enrollBusy || verifyCode.length !== 6}
                className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
              >
                <Check className="w-4 h-4" />
                Bevestig
              </button>
              <button
                onClick={() => {
                  setQrCode(null);
                  setSecret(null);
                  setVerifyCode("");
                }}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Annuleer
              </button>
            </div>
          </div>
        )}

        {err && <p className="text-xs text-red-300">{err}</p>}
      </section>

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-200 inline-flex items-center gap-2">
          <Key className="w-4 h-4" />
          Wachtwoord wijzigen
        </h2>
        <form onSubmit={changePassword} className="space-y-2">
          <input
            type="password"
            placeholder="Huidig wachtwoord"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
          />
          <input
            type="password"
            placeholder="Nieuw wachtwoord (min 12 tekens)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
          />
          <input
            type="password"
            placeholder="Herhaal nieuw wachtwoord"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pwBusy || !currentPw || !newPw || !newPw2}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
            >
              {pwBusy ? "Bezig…" : "Wijzig wachtwoord"}
            </button>
            {pwMsg && <span className="text-xs text-emerald-400">{pwMsg}</span>}
            {pwErr && <span className="text-xs text-red-300">{pwErr}</span>}
          </div>
        </form>
      </section>

      <div className="text-xs text-zinc-500">
        Wachtwoord vergeten? Vraag een admin om{" "}
        <Link
          href="/settings/users"
          className="text-emerald-400 hover:text-emerald-300"
        >
          een reset
        </Link>{" "}
        — er is geen e-mail-reset omdat de app voor besloten gebruik is.
      </div>
    </div>
  );
}

function Link({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
