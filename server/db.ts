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
      // Bug fix: users table was missing several columns that schema.ts (and
      // every query built from it, e.g. getUserByUsername) already expects —
      // same schema-drift pattern as the other ALTERs in this file. Only
      // password_hash was confirmed missing via a production error, but the
      // rest are guarded with IF NOT EXISTS too since drift here has
      // historically hit more than one column at a time.
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name text`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_config jsonb`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wins integer DEFAULT 0`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played integer DEFAULT 0`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_user_id text`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements jsonb DEFAULT '[]'`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token text`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires timestamp`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text`);
      // Bug fix: sync-profile inserts into `users` were failing 100% of the
      // time with "null value in column \"password\" violates not-null
      // constraint" — a legacy column literally named `password` (not
      // password_hash, a completely different column schema.ts doesn't
      // even know exists anymore) still has a NOT NULL constraint with no
      // default from before Supabase auth existed. Nothing in the current
      // app has ever set it, so every attempt to create a users row for a
      // real account died here — which is also why friend requests always
      // 404'd ("no account found"): the row was never actually created in
      // the first place, on either side.
      // Bug fix: sync-profile inserts were failing with "duplicate key
      // value violates unique constraint users_email_key" for any account
      // whose email happened to already exist in this table under a
      // different supabase_user_id. supabase_user_id is this table's real
      // identity key (see upsertUserFromAuth in storage.ts, which looks
      // rows up by supabase_user_id, never by email) — nothing about this
      // app's actual account model requires email to be globally unique
      // here, so enforcing it was just silently breaking real accounts.
      await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
      // Feature: Pre-game ready-up lobby
      await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_ready boolean DEFAULT false`);
      // Feature: Per-role player stats
      await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS role_stats jsonb DEFAULT '{}'`);
      // Bug fix: schema.ts has defined players.mvpCount ("mvp_count") for a
      // while now, but no ALTER TABLE was ever added here for it — so every
      // query touching the players table (Quick Match, the public rooms
      // browser, room join/create, etc.) was failing in production with
      // "column \"mvp_count\" does not exist", even though nothing about
      // the MVP feature itself was new or recently changed.
      await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS mvp_count integer DEFAULT 0`);
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
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_mfa (
          id serial PRIMARY KEY,
          supabase_user_id text NOT NULL UNIQUE,
          totp_secret text,
          is_enabled boolean DEFAULT false,
          created_at timestamp DEFAULT now()
        )
      `);
      // Feature: Email 2FA option (in addition to Google Authenticator)
      await client.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS mfa_method text DEFAULT 'totp'`);
      await client.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS mfa_email text`);
      await client.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS email_code text`);
      await client.query(`ALTER TABLE user_mfa ADD COLUMN IF NOT EXISTS email_code_expires timestamp`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          id serial PRIMARY KEY,
          room_id integer NOT NULL,
          name text NOT NULL,
          avatar text,
          avatar_config jsonb,
          role text,
          is_alive boolean DEFAULT true,
          is_host boolean DEFAULT false,
          session_id text NOT NULL,
          supabase_user_id text,
          is_spectator boolean DEFAULT false,
          is_bot boolean DEFAULT false,
          is_ready boolean DEFAULT false,
          wins integer DEFAULT 0,
          games_played integer DEFAULT 0,
          role_stats jsonb DEFAULT '{}',
          mvp_count integer DEFAULT 0,
          credits integer DEFAULT 0,
          achievements jsonb DEFAULT '[]',
          game_history jsonb DEFAULT '[]',
          joined_at timestamp DEFAULT now()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS rooms (
          id serial PRIMARY KEY,
          code text NOT NULL UNIQUE,
          status text NOT NULL DEFAULT 'lobby',
          phase text DEFAULT 'lobby',
          turn integer DEFAULT 1,
          settings jsonb NOT NULL,
          last_updated timestamp DEFAULT now()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id serial PRIMARY KEY,
          room_id integer NOT NULL,
          player_id integer NOT NULL,
          player_name text NOT NULL,
          content text NOT NULL,
          is_spectator boolean DEFAULT false,
          timestamp timestamp DEFAULT now()
        )
      `);
      // Feature: Friends list. One row per friend request; status starts
      // 'pending' and flips to 'accepted' — declines/unfriends just delete
      // the row rather than tracking a third status, since there's nothing
      // useful to show for a dead request either way.
      await client.query(`
        CREATE TABLE IF NOT EXISTS friendships (
          id serial PRIMARY KEY,
          requester_id text NOT NULL,
          addressee_id text NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          created_at timestamp DEFAULT now()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id)`);
      // Bug fix: createFriendRequest used to be a plain check-then-insert
      // (getFriendshipBetween, then insert if nothing came back) — a
      // classic race. Two requests arriving close together (a double-click,
      // or two different people friending each other at the same moment
      // from two different browsers) could both pass the "does this exist
      // yet" check before either insert actually landed, producing two rows
      // for the same pair. A frontend disable-while-sending guard (see
      // Friends.tsx) only prevents the single-browser double-click case —
      // it can't stop two different clients racing each other. This index
      // is the real fix: LEAST/GREATEST makes the pair order-independent
      // (A→B and B→A collide on the same index entry), so Postgres itself
      // rejects the second insert outright regardless of which side
      // initiated it or how close together they arrived.
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair_idx
        ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
      `);
      // Feature: Friends online status (heartbeat-based, see schema.ts)
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamp`);
      console.log("[DB] Migrations applied successfully");
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("[DB] Migration error (non-fatal):", err.message);
  }
}
