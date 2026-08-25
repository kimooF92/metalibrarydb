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
    max: process.env.VERCEL ? 2 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocal ? false : "require",
  });

// Always cache client on globalThis to preserve connection pool in serverless environments
globalForDb.conn = client;

export const db = drizzle(client, { schema });

export type DB = typeof db;
export { schema };
