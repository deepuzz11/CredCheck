import type { HTMLAttributes } from "react";

/**
 * The one place the "HUD panel" look is defined — a dark bordered box with
 * small corner brackets (a targeting-reticle motif that fits the scanner
 * theme) and an optional cut-in label, like a terminal section header.
 */
export function Panel({
  className = "",
  label,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      className={`relative border border-emerald-400/25 bg-black/40 ${className}`}
      {...props}
    >
      <CornerBrackets />
      {label && (
        <span className="absolute -top-2.5 left-3 bg-black px-1.5 text-[10px] uppercase tracking-widest text-emerald-400/70">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function CornerBrackets() {
  const base = "pointer-events-none absolute h-2.5 w-2.5 border-emerald-400/70";
  return (
    <>
      <span className={`${base} -left-px -top-px border-l-2 border-t-2`} />
      <span className={`${base} -right-px -top-px border-r-2 border-t-2`} />
      <span className={`${base} -bottom-px -left-px border-b-2 border-l-2`} />
      <span className={`${base} -bottom-px -right-px border-b-2 border-r-2`} />
    </>
  );
}
