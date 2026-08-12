import { db } from "./db";
import { pool } from "./db";
import { users, rooms, players, messages, friendships, type User, type Room, type Player, type CreateRoomRequest, type Message, type Friendship } from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";

// Diagnostic fix: POST /api/friends/request was 500ing for every user, even
// ones that clearly exist. runMigrations() (db.ts) creates the friendships
// table via CREATE TABLE IF NOT EXISTS, but that function is only ever
// awaited from the server's entrypoint at boot — it isn't called anywhere
// in routes.ts or storage.ts, so if that boot-time call silently failed,
// was skipped, or hasn't shipped to the running deployment yet, every
// friendship query throws "relation \"friendships\" does not exist"
// (Postgres error 42P01), which the route handlers just report as a bare
// 500. This makes every friendship-table method self-healing: the first
// time any of them hits a missing-table error, it creates the table (and
// indexes) itself and retries once, instead of depending on a startup step
// happening somewhere out of view.
let friendshipsTableEnsured = false;
async function ensureFriendshipsTable(): Promise<void> {
  if (friendshipsTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id serial PRIMARY KEY,
      requester_id text NOT NULL,
      addressee_id text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id)`);
  // Keep this in sync with the CREATE UNIQUE INDEX in db.ts's
  // runMigrations — see the comment there for why this exists.
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair_idx
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
  `);
  friendshipsTableEnsured = true;
}
async function withFriendshipsTable<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (err?.code === "42P01") {
      console.warn("[DB] friendships table missing — creating it now instead of failing this request");
      await ensureFriendshipsTable();
      return await fn();
    }
    throw err;
  }
}

export interface IStorage {
  createUser(user: Omit<User, "id" | "createdAt">): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserBySupabaseId(supabaseUserId: string): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  // Feature: sync a users row from the verified Supabase session, since
  // signup/login never wrote one before — see routes.ts POST
  // /api/auth/sync-profile. Creates the row on first call for an account,
  // and keeps `name` current on every later call (e.g. if the person
  // changes their display name in Supabase). `username` is derived once
  // from displayName and left stable after that, since friend requests key
  // off it — changing it later would break existing friend lookups by name.
  upsertUserFromAuth(supabaseUserId: string, displayName: string, email?: string | null): Promise<User>;

  createRoom(settings: CreateRoomRequest["settings"]): Promise<Room>;
  getRoomByCode(code: string): Promise<Room | undefined>;
  getRoom(id: number): Promise<Room | undefined>;
  updateRoom(id: number, updates: Partial<Room>): Promise<Room>;

  createPlayer(player: Omit<Player, "id" | "joinedAt">): Promise<Player>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayersInRoom(roomId: number): Promise<Player[]>;
  updatePlayer(id: number, updates: Partial<Player>): Promise<Player>;

  createMessage(message: Omit<Message, "id" | "timestamp">): Promise<Message>;
  getMessagesByRoom(roomId: number): Promise<Message[]>;
  deleteMessagesByRoom(roomId: number): Promise<void>;

  getLeaderboard(): Promise<{ name: string; avatar: string | null; avatarConfig: any; wins: number; gamesPlayed: number; winRate: number }[]>;
  resetPlayerStatsByName(name: string): Promise<number>;

  // Feature: Friends list + private lobbies
  createFriendRequest(requesterId: string, addresseeId: string): Promise<Friendship>;
  getFriendshipBetween(userA: string, userB: string): Promise<Friendship | undefined>;
  updateFriendshipStatus(id: number, status: string): Promise<Friendship>;
  deleteFriendship(id: number): Promise<void>;
  getFriendshipsForUser(supabaseUserId: string): Promise<Friendship[]>;
  getOpenPrivateRoomsInvitingUser(supabaseUserId: string): Promise<Room[]>;

  // Helper to generate unique room code
  generateRoomCode(): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  async createUser(user: Omit<User, "id" | "createdAt">): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserBySupabaseId(supabaseUserId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.supabaseUserId, supabaseUserId));
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  // Feature: sync a users row from the verified Supabase session. Real
  // accounts previously only ever existed in Supabase — signup/login never
  // wrote a matching `users` row, so getUserByUsername() (used by friend
  // requests) could never find anyone real. This backfills that row on
  // first sync and refreshes `name` on every later one.
  async upsertUserFromAuth(supabaseUserId: string, displayName: string, email?: string | null): Promise<User> {
    // Defense-in-depth: React already renders names as plain text (no
    // dangerouslySetInnerHTML anywhere touches this), so this isn't fixing
    // an active XSS — but display_name is fully unrestricted free text
    // from Supabase, and control/formatting characters (bidi overrides,
    // zero-width chars, etc.) can still cause real UI weirdness even
    // though they can't execute as code.
    const stripped = (displayName || "").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E]/g, "");
    const cleanName = stripped.trim().slice(0, 50) || `Player${supabaseUserId.slice(0, 6)}`;
    const existing = await this.getUserBySupabaseId(supabaseUserId);
    if (existing) {
      if (existing.name === cleanName) return existing;
      const [updated] = await db.update(users).set({ name: cleanName }).where(eq(users.id, existing.id)).returning();
      return updated;
    }

    // username is what friend search matches on, so it needs to be unique.
    // Start from the display name; if that's taken, append a short piece
    // of the supabase id (stable per-account, so retries are idempotent)
    // and only fall back to a numeric suffix in the rare case that's also
    // taken (e.g. two different accounts colliding after truncation).
    let username = cleanName;
    if (await this.getUserByUsername(username)) {
      username = `${cleanName.slice(0, 42)}_${supabaseUserId.slice(0, 6)}`;
      let suffix = 1;
      while (await this.getUserByUsername(username)) {
        suffix++;
        username = `${cleanName.slice(0, 40)}_${supabaseUserId.slice(0, 6)}${suffix}`;
      }
    }

    const [created] = await db.insert(users).values({
      username,
      email: email || null,
      passwordHash: "",
      name: cleanName,
      avatar: "👤",
      supabaseUserId,
    } as any).returning();
    return created;
  }

  async createRoom(settings: CreateRoomRequest["settings"]): Promise<Room> {
    const code = await this.generateRoomCode();
    // Retry insert on transient connection failures
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [room] = await db.insert(rooms).values({
          code,
          settings,
          status: "lobby",
          phase: "lobby"
        }).returning();
        return room;
      } catch (err: any) {
        if (attempt < 3 && (err?.message?.includes("Failed query") || err?.code?.startsWith("08") || err?.code === "ECONNRESET")) {
          console.warn(`[DB] createRoom retry ${attempt}/3 after error: ${err.message}`);
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error("createRoom failed after 3 retries");
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
        return room;
      } catch (err: any) {
        if (attempt < 3 && (err?.message?.includes("Failed query") || err?.code?.startsWith("08") || err?.code === "ECONNRESET")) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
          continue;
        }
        throw err;
      }
    }
    return undefined;
  }

  async getRoom(id: number): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async updateRoom(id: number, updates: Partial<Room>): Promise<Room> {
    const [room] = await db.update(rooms).set(updates).where(eq(rooms.id, id)).returning();
    return room;
  }

  async createPlayer(player: Omit<Player, "id" | "joinedAt">): Promise<Player> {
    const [newPlayer] = await db.insert(players).values(player).returning();
    return newPlayer;
  }

  async getPlayer(id: number): Promise<Player | undefined> {
    const [player] = await db.select().from(players).where(eq(players.id, id));
    return player;
  }

  async getPlayersInRoom(roomId: number): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.roomId, roomId));
  }

  async deletePlayer(id: number): Promise<void> {
    await db.delete(players).where(eq(players.id, id));
  }

  async updatePlayer(id: number, updates: Partial<Player>): Promise<Player> {
    const [player] = await db.update(players).set(updates).where(eq(players.id, id)).returning();
    return player;
  }

  async createMessage(message: Omit<Message, "id" | "timestamp">): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getMessagesByRoom(roomId: number): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.roomId, roomId)).orderBy(messages.timestamp);
  }

  async deleteMessagesByRoom(roomId: number): Promise<void> {
    await db.delete(messages).where(eq(messages.roomId, roomId));
  }

  async resetLeaderboard(): Promise<void> {
    await db.update(players).set({ wins: 0, gamesPlayed: 0, achievements: [] });
  }

  // Zeroes out wins/gamesPlayed/achievements for every player row matching
  // this exact name — same table getLeaderboard() reads from, and it already
  // filters out anyone with gamesPlayed = 0, so this is what actually removes
  // someone from the visible leaderboard (deleting from `users` does not,
  // since the leaderboard is sourced from `players`, not `users`).
  async resetPlayerStatsByName(name: string): Promise<number> {
    const updated = await db.update(players).set({ wins: 0, gamesPlayed: 0, achievements: [] }).where(eq(players.name, name)).returning();
    return updated.length;
  }

  async getLeaderboard() {
    const result = await db
      .select({
        name: players.name,
        avatar: players.avatar,
        avatarConfig: players.avatarConfig,
        wins: sql<number>`sum(${players.wins})`.as("total_wins"),
        gamesPlayed: sql<number>`sum(${players.gamesPlayed})`.as("total_games"),
      })
      .from(players)
      .where(sql`${players.isBot} = false`)
      .groupBy(players.name, players.avatar, players.avatarConfig)
      .having(sql`sum(${players.gamesPlayed}) > 0`)
      .orderBy(desc(sql`sum(${players.wins})`))
      .limit(20);

    return result.map(r => ({
      name: r.name,
      avatar: r.avatar,
      avatarConfig: r.avatarConfig,
      wins: Number(r.wins) || 0,
      gamesPlayed: Number(r.gamesPlayed) || 0,
      winRate: Number(r.gamesPlayed) > 0 ? Math.round((Number(r.wins) / Number(r.gamesPlayed)) * 100) : 0,
    }));
  }

  // Feature: Friends list + private lobbies
  async createFriendRequest(requesterId: string, addresseeId: string): Promise<Friendship> {
    return withFriendshipsTable(async () => {
      try {
        const [friendship] = await db.insert(friendships).values({
          requesterId,
          addresseeId,
          status: "pending",
        }).returning();
        return friendship;
      } catch (err: any) {
        // Bug fix: the unique-pair index (see db.ts) is what actually
        // stops a race between two simultaneous requests — this turns
        // that DB-level rejection into the same "already exists" outcome
        // the normal check-then-insert path returns, so the route handler
        // (and the person on the other end) sees a clean, expected result
        // instead of a raw 500 on the rare occasion the race is actually
        // hit.
        if (err?.code === "23505" && err?.constraint === "friendships_unique_pair_idx") {
          const existing = await this.getFriendshipBetween(requesterId, addresseeId);
          if (existing) return existing;
        }
        throw err;
      }
    });
  }

  // Order-independent lookup — a friendship between A and B is the same
  // relationship regardless of who originally sent the request, so every
  // caller (duplicate-request checks, accept/decline, unfriend) needs to
  // find it without caring which side is requester vs. addressee.
  async getFriendshipBetween(userA: string, userB: string): Promise<Friendship | undefined> {
    return withFriendshipsTable(async () => {
      const [friendship] = await db.select().from(friendships).where(
        or(
          and(eq(friendships.requesterId, userA), eq(friendships.addresseeId, userB)),
          and(eq(friendships.requesterId, userB), eq(friendships.addresseeId, userA)),
        )
      );
      return friendship;
    });
  }

  async updateFriendshipStatus(id: number, status: string): Promise<Friendship> {
    return withFriendshipsTable(async () => {
      const [friendship] = await db.update(friendships).set({ status }).where(eq(friendships.id, id)).returning();
      return friendship;
    });
  }

  async deleteFriendship(id: number): Promise<void> {
    return withFriendshipsTable(async () => {
      await db.delete(friendships).where(eq(friendships.id, id));
    });
  }

  async getFriendshipsForUser(supabaseUserId: string): Promise<Friendship[]> {
    return withFriendshipsTable(async () => {
      return await db.select().from(friendships).where(
        or(eq(friendships.requesterId, supabaseUserId), eq(friendships.addresseeId, supabaseUserId))
      );
    });
  }

  // Feature: Private lobbies. Rooms still in the lobby (not yet started/
  // ended) whose settings.invitedSupabaseUserIds jsonb array contains this
  // user's id. `?` is Postgres's jsonb "does this array/object contain this
  // key/element" operator.
  async getOpenPrivateRoomsInvitingUser(supabaseUserId: string): Promise<Room[]> {
    return await db.select().from(rooms).where(
      and(
        eq(rooms.status, "lobby"),
        sql`${rooms.settings} -> 'invitedSupabaseUserIds' @> ${JSON.stringify([supabaseUserId])}::jsonb`
      )
    );
  }

  async generateRoomCode(): Promise<string> {
    // Security fix (#7/#9): was 4 characters (26^4 ≈ 457k combinations),
    // cheap to enumerate at scale since room lookup/join had no rate limit
    // of their own (see roomJoinLimiter/roomLookupLimiter added in
    // routes.ts). 6 characters (26^6 ≈ 309M) is still short enough to read
    // aloud and type on a phone, but raises the brute-force cost by ~675x,
    // and combined with rate limiting makes scanning the whole keyspace
    // impractical rather than merely inconvenient.
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    while (true) {
      code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.getRoomByCode(code);
      if (!existing) break;
    }
    return code;
  }
}

export const storage = new DatabaseStorage();
