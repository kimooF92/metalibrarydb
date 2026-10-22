import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const isLocal =
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1") ||
  !connectionString;

export const client =
  globalForDb.conn ??
  postgres(connectionString || "postgres://localhost:5432/postgres", {
    prepare: false,
    fetch_types: false,
    max: process.env.VERCEL ? 2 : 6,
    idle_timeout: 120, // 2 minutes: prevents rapid connect/disconnect churn in Supavisor
    connect_timeout: 10,
    max_lifetime: 60 * 30, // Recycle stale connections after 30 mins
    ssl: isLocal ? false : "require",
  });

// Always cache client on globalThis to preserve connection pool in serverless environments
globalForDb.conn = client;

export const db = drizzle(client, { schema });

export type DB = typeof db;
export { schema };
