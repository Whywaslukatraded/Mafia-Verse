import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or SUPABASE_DB_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: false,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err.message);
});

pool.on("connect", () => {
  console.log("[DB] New client connected to pool");
});

pool.on("acquire", () => {
  if (pool.waitingCount > 0) {
    console.warn(`[DB] Pool stressed: ${pool.waitingCount} waiting, ${pool.idleCount} idle, ${pool.totalCount} total`);
  }
});

export const db = drizzle(pool, { schema });

export async function testConnection(retries = 5, delayMs = 2000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      console.log("[DB] Connected successfully");
      return true;
    } catch (err: any) {
      console.error(`[DB] Connection attempt ${i + 1}/${retries} failed:`, err.message);
      if (i < retries - 1) {
        const backoff = delayMs * Math.pow(2, i);
        console.log(`[DB] Retrying in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  console.error("[DB] All connection attempts failed. Database is unreachable.");
  return false;
}

export async function runMigrations(): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0`);
      await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ad_claims (
          id serial PRIMARY KEY,
          session_id text NOT NULL,
          claim_date text NOT NULL,
          claim_count integer NOT NULL DEFAULT 0,
          last_claim_at timestamp DEFAULT now(),
          UNIQUE(session_id, claim_date)
        )
      `);
      console.log("[DB] Migrations applied successfully");
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Migration error (non-fatal):", err.message);
  }
}
