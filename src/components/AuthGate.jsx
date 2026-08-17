import React, { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export function useSession() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}

export function SignOutButton({ className }) {
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      className={className || "text-[11px] text-zinc-500 border border-zinc-800 rounded-full px-2.5 py-1 active:text-zinc-300 flex items-center gap-1"}
    >
      <LogOut size={12} /> Sign Out
    </button>
  );
}

export default function AuthGate({ children }) {
  const session = useSession();
  const [mode, setMode] = useState("sign-in"); // sign-in | sign-up
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-400" size={32} />
      </div>
    );
  }

  if (session) {
    return children;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("sign-in");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3.5 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-lg font-bold text-emerald-400">
          {mode === "sign-in" ? "Sign in" : "Create account"}
        </h1>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-400"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-zinc-800 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-400"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {notice && <p className="text-xs text-emerald-400">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-xl bg-emerald-400 text-zinc-950 font-semibold disabled:opacity-40"
        >
          {busy ? "Please wait…" : mode === "sign-in" ? "Sign In" : "Sign Up"}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); setNotice(""); }}
          className="w-full text-xs text-zinc-500"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
