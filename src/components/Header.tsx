import Link from "next/link";

export function Header() {
  return (
    <header
      id="app-header"
      className="sticky top-0 z-20 border-b border-emerald-400/20 bg-black/70 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-sm">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="text-emerald-400 [text-shadow:0_0_10px_rgba(74,222,128,0.5)]">
            credcheck<span className="text-emerald-400/50">://</span>scan
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-emerald-400/70">
          <Link href="/" className="transition hover:text-emerald-300">
            [ scan ]
          </Link>
          <Link href="/history" className="transition hover:text-emerald-300">
            [ history ]
          </Link>
          <Link href="/compare" className="transition hover:text-emerald-300">
            [ compare ]
          </Link>
        </nav>
      </div>
    </header>
  );
}
