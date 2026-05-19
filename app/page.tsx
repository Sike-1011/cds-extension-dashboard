"use client";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type AuthUser   = { id: string; email: string; is_active: boolean };
type SessionRow = { email: string; last_ping: string | null; expires_at: string; otp_code: string; device_id: string | null };

const ONLINE_MS = 12 * 60 * 1000; // 12 minutes

// Derive a human name from an email like "abhinandan.srivastava@astraglobal.com"
function nameFromEmail(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[_\-]/g, ".");
  return local
    .split(".")
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function LoginScreen() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 p-7 rounded-2xl shadow-xl w-80 space-y-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-1">CDS Loans Automator</div>
          <h1 className="text-white text-lg font-bold">Manager Sign-in</h1>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Email</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Password</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            type="password" value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────

function Dashboard() {
  const [users, setUsers]         = useState<AuthUser[]>([]);
  const [sessions, setSessions]   = useState<SessionRow[]>([]);
  const [busy, setBusy]           = useState(false);
  const [pickEmail, setPickEmail] = useState("");
  const [generated, setGenerated] = useState<{ email: string; otp: string; expires: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from("authorized_users").select("*").order("email"),
      supabase.from("access_sessions")
        .select("email,last_ping,expires_at,otp_code,device_id")
        .gt("expires_at", new Date().toISOString())
    ]);
    setUsers(u ?? []);
    setSessions(s ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  function lastPingFor(email: string): Date | null {
    const rows = sessions.filter(r =>
      r.email.toLowerCase() === email.toLowerCase() && r.last_ping
    );
    if (!rows.length) return null;
    return new Date(Math.max(...rows.map(r => new Date(r.last_ping!).getTime())));
  }

  function isOnline(email: string) {
    const p = lastPingFor(email);
    return p ? (Date.now() - p.getTime()) < ONLINE_MS : false;
  }

  async function generateOtp() {
    if (!pickEmail) return;
    setBusy(true); setGenerated(null);
    const otp        = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error }  = await supabase.from("access_sessions").insert({
      email: pickEmail, otp_code: otp, device_id: null, expires_at
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setGenerated({ email: pickEmail, otp, expires: expires_at });
    load();
  }

  async function resetAll() {
    if (!confirm("Invalidate ALL active OTPs and sessions? Staff will be locked out immediately.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reset_all_sessions");
    setBusy(false);
    if (error) { alert("Reset failed: " + error.message); return; }
    const count = typeof data === "number" ? data : 0;
    alert(count > 0
      ? `✅ Reset complete — ${count} session(s)/OTP(s) wiped. All staff are now logged out.`
      : "✅ Reset complete — no active sessions or OTPs to remove."
    );
    setGenerated(null);
    load();
  }

  async function resetUser(email: string) {
    if (!confirm(`Sign ${nameFromEmail(email)} out of the extension and revoke any unused OTP?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("reset_user_session", { p_email: email });
    setBusy(false);
    if (error) { alert("Logout failed: " + error.message); return; }
    const count = typeof data === "number" ? data : 0;
    alert(count > 0
      ? `✅ ${nameFromEmail(email)} signed out — ${count} row(s) cleared.`
      : `✅ ${nameFromEmail(email)} had no active session or OTP to clear.`
    );
    load();
  }

  const onlineCount = users.filter(u => isOnline(u.email)).length;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">CDS Extension — Access Control</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              <span className="text-emerald-400 font-semibold">{onlineCount}</span> of {users.length} users online
            </p>
          </div>
          <button
            className="text-sm text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>

        {/* Action bar */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <select
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 min-w-64"
            value={pickEmail}
            onChange={e => { setPickEmail(e.target.value); setGenerated(null); }}
          >
            <option value="">— select employee —</option>
            {users.filter(u => u.is_active).map(u => (
              <option key={u.id} value={u.email}>
                {nameFromEmail(u.email)} ({u.email})
              </option>
            ))}
          </select>

          <button
            disabled={!pickEmail || busy}
            onClick={generateOtp}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Generate Daily OTP
          </button>

          <button
            disabled={busy}
            onClick={resetAll}
            className="ml-auto bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Reset All Sessions
          </button>
        </div>

        {/* Generated OTP banner */}
        {generated && (
          <div className="bg-amber-950/40 border border-amber-700/60 rounded-xl p-4 flex items-start gap-4">
            <div className="flex-1">
              <div className="text-sm text-amber-200 font-medium mb-1">
                OTP for <span className="font-mono">{nameFromEmail(generated.email)}</span>{" "}
                <span className="text-amber-400/70 font-mono">({generated.email})</span>
              </div>
              <div className="font-mono text-4xl tracking-[0.3em] text-amber-300 font-bold">
                {generated.otp}
              </div>
              <div className="text-xs text-amber-400/80 mt-1">
                Valid until {new Date(generated.expires).toLocaleString()} · Share this directly with the employee
              </div>
            </div>
            <button
              className="text-amber-400 hover:text-amber-200 text-xs underline"
              onClick={() => setGenerated(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* User table */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/70 border-b border-slate-800 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="px-4 py-3 text-left w-12">Status</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Last ping</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map(u => {
                const lp        = lastPingFor(u.email);
                const online    = isOnline(u.email);
                const hasSess   = sessions.some(s => s.email.toLowerCase() === u.email.toLowerCase());
                return (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <span
                        title={online ? "Online" : "Offline"}
                        className={`inline-block w-3 h-3 rounded-full ${online ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-600"}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {nameFromEmail(u.email)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {lp ? lp.toLocaleString() : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => resetUser(u.email)}
                        disabled={busy || !hasSess}
                        title={hasSess
                          ? `Sign ${nameFromEmail(u.email)} out and revoke any unused OTP`
                          : "No active session or OTP to revoke"}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors
                          bg-red-600/15 border-red-700/40 text-red-300
                          hover:bg-red-600/30 hover:text-white hover:border-red-500
                          disabled:bg-slate-800/40 disabled:border-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed"
                      >
                        Sign out
                      </button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No authorized users found. Run the SQL seed script first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Page() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authed === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }
  return authed ? <Dashboard /> : <LoginScreen />;
}
