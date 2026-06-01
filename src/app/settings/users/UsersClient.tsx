"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  RefreshCw,
} from "lucide-react";

interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "viewer";
  totpEnabled: boolean;
  createdAt: number;
  lastLogin: number | null;
}

export default function UsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [cu, setCu] = useState("");
  const [cp, setCp] = useState("");
  const [cr, setCr] = useState<"admin" | "viewer">("viewer");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/users");
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Laden mislukt");
        return;
      }
      setUsers(d.users);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateErr("");
    setCreateBusy(true);
    try {
      const r = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cu, password: cp, role: cr }),
      });
      const d = await r.json();
      if (!r.ok) {
        setCreateErr(d.error || "Aanmaken mislukt");
        return;
      }
      setCu("");
      setCp("");
      setCr("viewer");
      setShowCreate(false);
      load();
    } finally {
      setCreateBusy(false);
    }
  }

  async function resetPassword(u: UserRow) {
    const pw = prompt(`Nieuw wachtwoord voor ${u.username} (min 12 tekens):`);
    if (!pw) return;
    const r = await fetch(`/api/auth/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Reset mislukt");
      return;
    }
    alert(`Wachtwoord van ${u.username} gewijzigd.`);
  }

  async function resetTotp(u: UserRow) {
    if (
      !confirm(
        `2FA resetten voor ${u.username}? Bij volgende login moet ze opnieuw enrollen. Gebruik dit als ze hun authenticator-toestel kwijt zijn.`,
      )
    )
      return;
    const r = await fetch(`/api/auth/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetTotp: true }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Reset mislukt");
      return;
    }
    load();
  }

  async function toggleRole(u: UserRow) {
    const next = u.role === "admin" ? "viewer" : "admin";
    if (
      !confirm(
        `Rol van ${u.username} naar '${next}' wijzigen? ${next === "admin" ? "Admin kan gebruikers beheren en alle data wijzigen." : "Viewer kan alleen lezen + reguliere boekhouding doen, geen gebruikers/instellingen."}`,
      )
    )
      return;
    const r = await fetch(`/api/auth/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Mislukt");
      return;
    }
    load();
  }

  async function deleteUser(u: UserRow) {
    if (
      !confirm(
        `Gebruiker ${u.username} verwijderen? Kan niet ongedaan gemaakt worden.`,
      )
    )
      return;
    const r = await fetch(`/api/auth/users/${u.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) {
      alert(d.error || "Verwijderen mislukt");
      return;
    }
    load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Laden…</p>;
  if (err)
    return (
      <p className="text-sm text-red-300">
        {err === "Alleen admin mag dit doen"
          ? "Alleen admins kunnen deze pagina zien — log in als admin."
          : err}
      </p>
    );

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg"
      >
        <Plus className="w-4 h-4" />
        {showCreate ? "Annuleer" : "Nieuwe gebruiker"}
      </button>

      {showCreate && (
        <form
          onSubmit={createUser}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Gebruikersnaam"
              value={cu}
              onChange={(e) => setCu(e.target.value)}
              required
              autoComplete="off"
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            />
            <input
              type="text"
              placeholder="Wachtwoord (min 12)"
              value={cp}
              onChange={(e) => setCp(e.target.value)}
              required
              autoComplete="new-password"
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            />
            <select
              value={cr}
              onChange={(e) => setCr(e.target.value as "admin" | "viewer")}
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200"
            >
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <p className="text-[11px] text-zinc-500">
            De gebruiker stelt 2FA zelf in via{" "}
            <code>/settings/security</code> na eerste login.
          </p>
          {createErr && (
            <p className="text-xs text-red-300">{createErr}</p>
          )}
          <button
            type="submit"
            disabled={createBusy}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            {createBusy ? "Aanmaken…" : "Aanmaken"}
          </button>
        </form>
      )}

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] text-zinc-500 uppercase tracking-wider bg-zinc-900/40">
            <tr>
              <th className="text-left px-4 py-2">Gebruiker</th>
              <th className="text-left px-4 py-2 w-20">Rol</th>
              <th className="text-left px-4 py-2 w-20">2FA</th>
              <th className="text-left px-4 py-2 w-32">Laatste login</th>
              <th className="text-right px-4 py-2 w-44">Acties</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--border)]">
                <td className="px-4 py-2 text-zinc-200">
                  <p className="font-medium">{u.username}</p>
                  {u.email && (
                    <p className="text-[11px] text-zinc-500">{u.email}</p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleRole(u)}
                    className={`text-[11px] px-2 py-0.5 rounded ${
                      u.role === "admin"
                        ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                    title="Klik om rol te wisselen"
                  >
                    {u.role}
                  </button>
                </td>
                <td className="px-4 py-2">
                  {u.totpEnabled ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Aan
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-300 text-xs">
                      <ShieldOff className="w-3.5 h-3.5" />
                      Uit
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {u.lastLogin
                    ? new Date(u.lastLogin).toLocaleDateString("nl-NL")
                    : "nooit"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => resetPassword(u)}
                      className="p-1.5 text-zinc-500 hover:text-zinc-200"
                      title="Reset wachtwoord"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => resetTotp(u)}
                      disabled={!u.totpEnabled}
                      className="p-1.5 text-zinc-500 hover:text-amber-300 disabled:opacity-30"
                      title="Reset 2FA (alleen als toestel kwijt is)"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteUser(u)}
                      className="p-1.5 text-zinc-500 hover:text-red-300"
                      title="Verwijder gebruiker"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
