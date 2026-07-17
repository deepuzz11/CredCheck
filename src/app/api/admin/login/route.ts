import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE_NAME, isAdminConfigured, issueSessionCookie, verifyPassword } from "@/lib/auth/adminSession";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ password: z.string().min(1) });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(`admin-login:${ip}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts — please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin login isn't configured (ADMIN_PASSWORD is not set)." },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (!verifyPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = issueSessionCookie()!;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
