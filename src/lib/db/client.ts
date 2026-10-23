import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

const connectionString = env.DATABASE_URL;

export const sql = connectionString
  ? postgres(connectionString, {
      max: env.DATABASE_POOL_MAX,
      prepare: false,
    })
  : null;

export const db = sql ? drizzle(sql) : null;
