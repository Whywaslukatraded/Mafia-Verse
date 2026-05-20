import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("Unexpected DB pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export async function testConnection(retries = 3, delayMs = 1000): Promise<boolean> {
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
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return false;
}
