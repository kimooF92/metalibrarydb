import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "";

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

export const client =
  globalForDb.conn ??
  postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 15,
    connect_timeout: 15,
    ssl: "require",
  });

if (process.env.NODE_ENV !== "production") globalForDb.conn = client;

export const db = drizzle(client, { schema });

export type DB = typeof db;
export { schema };
