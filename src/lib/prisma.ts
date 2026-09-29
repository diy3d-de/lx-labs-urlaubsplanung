import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const dbPath = process.env.SQLITE_PATH ?? path.join(process.cwd(), "prisma", "dev.db");
  const adapter = new PrismaBetterSQLite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
