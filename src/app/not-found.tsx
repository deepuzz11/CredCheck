import Link from "next/link";
import { Panel } from "@/components/Panel";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <Panel className="p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400/70">// error 404</p>
        <h1 className="mt-2 text-lg font-semibold text-emerald-100">
          target not found<span className="animate-blink text-emerald-400/70">_</span>
        </h1>
        <p className="mt-2 text-sm text-emerald-100/50">
          Nothing lives at this address. The page may have moved, or the link was mistyped.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block border border-emerald-400/50 bg-emerald-400/10 px-5 py-2.5 text-sm text-emerald-300 transition hover:bg-emerald-400/20"
        >
          [ back to the scanner ]
        </Link>
      </Panel>
    </main>
  );
}
