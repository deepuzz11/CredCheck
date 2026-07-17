import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton: avoids exhausting DB connections
// across hot-reloads, which each re-execute this module.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
