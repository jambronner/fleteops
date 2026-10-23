import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile?.(".env.local");
} catch {}

try {
  process.loadEnvFile?.(".env");
} catch {}

if (process.env.FLETEOPS_MODE !== "connected") {
  throw new Error("Database commands require explicit FLETEOPS_MODE=connected. Use only your own disposable development database first.");
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
