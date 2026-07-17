import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/auth/adminSession";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
