import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminConfigured, verifySessionCookie } from "@/lib/auth/adminSession";
import { prisma } from "@/lib/db/prisma";
import { Panel } from "@/components/Panel";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminReportRow } from "@/components/AdminReportRow";
import { LogoutButton } from "@/components/LogoutButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — CredCheck" };

const STATUS_DOT: Record<string, string> = {
  approved: "bg-emerald-400",
  rejected: "bg-red-400",
};

export default async function AdminPage() {
  if (!isAdminConfigured()) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <Panel className="p-8">
          <h1 className="text-lg font-semibold text-emerald-100">Admin not configured</h1>
          <p className="mt-2 text-sm text-emerald-100/50">
            Set <code className="text-emerald-300">ADMIN_PASSWORD</code> in your environment to
            enable the scam-report moderation queue.
          </p>
        </Panel>
      </main>
    );
  }

  const store = await cookies();
  const authed = verifySessionCookie(store.get(ADMIN_COOKIE_NAME)?.value);

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center px-4">
        <Panel label="admin login" className="p-6">
          <AdminLoginForm />
        </Panel>
      </main>
    );
  }

  const [pending, recent] = await Promise.all([
    prisma.scamReport.findMany({ where: { status: "pending" }, orderBy: { createdAt: "desc" } }),
    prisma.scamReport.findMany({
      where: { status: { not: "pending" } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.2em] text-emerald-400/60">
            // moderation queue
          </p>
          <h1 className="text-xl font-bold tracking-tight text-emerald-400 [text-shadow:0_0_16px_rgba(74,222,128,0.45)]">
            SCAM REPORT REVIEW
          </h1>
          <p className="mt-1 text-sm text-emerald-100/40">
            Only approved reports count toward the scam_reports signal on future scans.
          </p>
        </div>
        <LogoutButton />
      </div>

      <h2 className="mb-2 text-xs uppercase tracking-wider text-emerald-100/50">
        pending ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <Panel className="p-6 text-sm text-emerald-100/50">No pending reports.</Panel>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <AdminReportRow
              key={r.id}
              report={{
                id: r.id,
                target: r.target,
                targetType: r.targetType,
                reason: r.reason,
                createdAt: r.createdAt.toISOString(),
              }}
            />
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-xs uppercase tracking-wider text-emerald-100/50">
            recently reviewed
          </h2>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 border border-emerald-400/10 bg-black/30 px-4 py-2.5 text-sm"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-emerald-100/30"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs text-emerald-100/70">
                  {r.target}
                </span>
                <span className="shrink-0 text-xs uppercase text-emerald-100/35">{r.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
