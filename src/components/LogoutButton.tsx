"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        router.refresh();
      }}
      className="border border-emerald-400/20 px-3 py-1.5 text-xs text-emerald-100/60 transition hover:border-emerald-400/50 hover:text-emerald-300"
    >
      [ log out ]
    </button>
  );
}
