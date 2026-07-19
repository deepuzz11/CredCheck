import Link from "next/link";
import type { Metadata } from "next";
import type { ScanResult } from "@/lib/scan";
import { loadReportRow } from "@/lib/reportLookup";
import { ResultsView } from "@/components/ResultsView";
import { Panel } from "@/components/Panel";
import { PrintableReport } from "@/components/PrintableReport";

export const dynamic = "force-dynamic";
const loadReport = loadReportRow;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await loadReport(id);
  if (!row) return { title: "Report not found — CredCheck" };
  const result = row.resultJson as unknown as ScanResult;
  const score = result.score?.trust_score;
  const band = result.score?.risk_band;
  const bandLabel =
    band === "trusted" ? "Likely legitimate" : band === "high" ? "High risk" : "Caution advised";
  const description =
    typeof score === "number"
      ? `${bandLabel} — trust score ${score}/100 from ${result.signals?.length ?? "multiple"} independent signals. Informational only.`
      : "A shared trust-scan result from CredCheck.";
  return {
    title: `${row.normalizedKey} — CredCheck report`,
    description,
    openGraph: {
      title: `${row.normalizedKey} — CredCheck trust report`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${row.normalizedKey} — CredCheck trust report`,
      description,
    },
  };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const row = await loadReport(id);

  if (!row) {
    return (
      <EmptyState
        title="Report not found"
        message="This link doesn't match any saved report. It may have been mistyped, or the database has been reset."
      />
    );
  }

  const expired = row.expiresAt.getTime() <= Date.now();
  if (expired) {
    return (
      <EmptyState
        title="This report has expired"
        message={`Results are cached for 48h. This one was scanned ${row.createdAt.toLocaleString()} and has since expired — run a fresh scan to get current data.`}
        target={row.normalizedKey}
      />
    );
  }

  const result: ScanResult = { ...(row.resultJson as unknown as ScanResult), id: row.id, cached: true };

  if (print === "1") {
    return (
      <>
        {/* The root layout always renders the app header; hide it for the
            standalone print/PDF document — see the PDF export route. */}
        <style>{"#app-header{display:none}"}</style>
        <PrintableReport result={result} />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-14">
      <div className="mb-6 flex items-center justify-between text-xs">
        <Link href="/" className="text-emerald-400 hover:text-emerald-300">
          ← run a new scan
        </Link>
        <span className="text-emerald-100/40">
          shared report · scanned {new Date(result.scanned_at).toLocaleString()}
        </span>
      </div>
      <ResultsView result={result} />
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/api/report/${id}/pdf`}
          className="inline-flex items-center gap-1.5 border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"
        >
          [ download pdf ↓ ]
        </a>
        <a
          href={`/api/report/${id}/json`}
          className="inline-flex items-center gap-1.5 border border-emerald-400/30 px-3 py-1.5 text-xs text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/10"
        >
          [ download json ↓ ]
        </a>
      </div>
      <footer className="mt-10">
        <Panel className="px-4 py-3 text-center text-xs leading-relaxed text-emerald-100/40">
          <strong className="text-emerald-100/70">Informational only.</strong> CredCheck combines
          public signals to help you make your own judgement. It is <em>not</em> a guarantee of
          safety or a verdict on any seller.
        </Panel>
      </footer>
    </main>
  );
}

function EmptyState({
  title,
  message,
  target,
}: {
  title: string;
  message: string;
  target?: string;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <Panel className="p-8">
        <h1 className="text-lg font-semibold text-emerald-100">{title}</h1>
        <p className="mt-2 text-sm text-emerald-100/50">{message}</p>
        <Link
          href={target ? `/?rescan=${encodeURIComponent(target)}` : "/"}
          className="mt-6 inline-block border border-emerald-400/50 bg-emerald-400/10 px-5 py-2.5 text-sm text-emerald-300 transition hover:bg-emerald-400/20"
        >
          {target ? "[ scan it again ]" : "[ go to credcheck ]"}
        </Link>
      </Panel>
    </main>
  );
}
