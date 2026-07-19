"use client";

import { useEffect, useState } from "react";

/**
 * Plain share-intent links — no SDKs, no tracking scripts, just the
 * platforms' own URL schemes. Rendered client-side because the share text
 * needs the page's absolute URL.
 */
export function ShareLinks({ summary }: { summary: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(window.location.href.split("?")[0]);
  }, []);
  if (!url) return null;

  const text = encodeURIComponent(`${summary} — via CredCheck`);
  const encodedUrl = encodeURIComponent(url);
  const links = [
    { label: "whatsapp", href: `https://wa.me/?text=${text}%20${encodedUrl}` },
    { label: "telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${text}` },
    { label: "x", href: `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}` },
  ];

  return (
    <span className="inline-flex items-center gap-2 text-xs text-emerald-100/40">
      share:
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="border border-emerald-400/20 px-2 py-1 text-emerald-300/70 transition hover:border-emerald-400/50 hover:text-emerald-300"
        >
          [{l.label}]
        </a>
      ))}
    </span>
  );
}
