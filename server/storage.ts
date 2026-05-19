import { db } from "./db";
import { users, rooms, players, messages, type User, type Room, type Player, type CreateRoomRequest, type Message } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";

export interface IStorage {
  createUser(user: Omit<User, "id" | "createdAt">): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;
  getUserByResetToken(token: string): Promise<User | undefined>;

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

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async createRoom(settings: CreateRoomRequest["settings"]): Promise<Room> {
    const code = await this.generateRoomCode();
    const [room] = await db.insert(rooms).values({
      code,
      settings,
      status: "lobby",
      phase: "lobby"
    }).returning();
    return room;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code.toUpperCase()));
    return room;
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

  async generateRoomCode(): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    while (true) {
      code = "";
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.getRoomByCode(code);
      if (!existing) break;
    }
    return code;
  }
}

export const storage = new DatabaseStorage();
