import { db } from "./db";
import { rooms, players, messages, type Room, type Player, type CreateRoomRequest, type Message } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";

export interface IStorage {
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
  
  // Helper to generate unique room code
  generateRoomCode(): Promise<string>;
}

export class DatabaseStorage implements IStorage {
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
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
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
