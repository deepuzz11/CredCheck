"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Login failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2 border border-emerald-400/20 bg-black/40 px-3 py-2.5">
        <span className="text-emerald-400/70" aria-hidden>
          &gt;
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
          className="w-full bg-transparent text-sm text-emerald-100 outline-none placeholder:text-emerald-100/25"
        />
      </div>
      {error && <p className="text-xs text-red-400">! {error}</p>}
      <button
        type="submit"
        disabled={loading || !password}
        className="w-full border border-emerald-400/60 bg-emerald-400/10 px-4 py-2.5 text-sm uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "signing in…" : "[ sign in ]"}
      </button>
    </form>
  );
}
