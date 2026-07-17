"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "./Panel";

export interface PendingReport {
  id: string;
  target: string;
  targetType: string;
  reason: string | null;
  createdAt: string;
}

export function AdminReportRow({ report }: { report: PendingReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Action failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <Panel className="p-4">
      <div className="min-w-0">
        <span className="block text-sm text-emerald-100">{report.target}</span>
        <span className="text-xs text-emerald-100/35">
          {report.targetType} · {new Date(report.createdAt).toLocaleString()}
        </span>
        {report.reason && (
          <p className="mt-1.5 text-sm text-emerald-100/60">&quot;{report.reason}&quot;</p>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">! {error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => act("approve")}
          disabled={busy !== null}
          className="border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
        >
          {busy === "approve" ? "approving…" : "[ ✓ approve ]"}
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={busy !== null}
          className="border border-red-400/30 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-400/10 disabled:opacity-40"
        >
          {busy === "reject" ? "rejecting…" : "[ ✗ reject ]"}
        </button>
      </div>
    </Panel>
  );
}
