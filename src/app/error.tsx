"use client";

import { useEffect } from "react";
import { Panel } from "@/components/Panel";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] runtime error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <Panel className="p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400/70">// runtime fault</p>
        <h1 className="mt-2 text-lg font-semibold text-emerald-100">
          something broke on our side<span className="animate-blink text-emerald-400/70">_</span>
        </h1>
        <p className="mt-2 text-sm text-emerald-100/50">
          The error has been logged. Your scan data is safe — try the same action again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-block border border-emerald-400/50 bg-emerald-400/10 px-5 py-2.5 text-sm text-emerald-300 transition hover:bg-emerald-400/20"
        >
          [ retry ]
        </button>
      </Panel>
    </main>
  );
}
