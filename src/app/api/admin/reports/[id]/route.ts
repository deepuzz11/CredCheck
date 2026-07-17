import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ADMIN_COOKIE_NAME, verifySessionCookie } from "@/lib/auth/adminSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ action: z.enum(["approve", "reject"]) });

async function requireAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionCookie(store.get(ADMIN_COOKIE_NAME)?.value);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
  }

  try {
    await prisma.scamReport.update({
      where: { id },
      data: { status: parsed.data.action === "approve" ? "approved" : "rejected" },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
}
