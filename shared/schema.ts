import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("lobby"), // lobby, day, night, ended
  phase: text("phase").default("lobby"), // detailed phase: discussion, voting, mafia, doctor, detective
  turn: integer("turn").default(1),
  settings: jsonb("settings").notNull().$type<{
    mafiaCount: number;
    detectiveCount: number;
    doctorCount: number;
    civilianCount: number;
    phaseDuration: number;
    mafiaDuration: number;
    doctorDuration: number;
    detectiveDuration: number;
    roomName?: string;
    showVoteResults?: boolean;
    showRoleReveal?: boolean;
  }>(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(), // Foreign key handled in app logic for simplicity or can be strict
  name: text("name").notNull(),
  avatar: text("avatar"),
  avatarConfig: jsonb("avatar_config").$type<{
    accessory?: string;
    clothing?: string;
    bg?: string;
  }>(),
  role: text("role"), // mafia, detective, doctor, civilian (null in lobby)
  isAlive: boolean("is_alive").default(true),
  isHost: boolean("is_host").default(false),
  sessionId: text("session_id").notNull(), // To reconnect
  isSpectator: boolean("is_spectator").default(false),
  isBot: boolean("is_bot").default(false),
  wins: integer("wins").default(0),
  gamesPlayed: integer("games_played").default(0),
  achievements: jsonb("achievements").default([]),
  gameHistory: jsonb("game_history").default([]),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// === SCHEMAS ===

export const insertRoomSchema = createInsertSchema(rooms).pick({
  code: true,
  settings: true,
});

export const insertPlayerSchema = createInsertSchema(players).pick({
  name: true,
  avatar: true,
  roomId: true,
  sessionId: true,
  isHost: true,
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  playerId: integer("player_id").notNull(),
  playerName: text("player_name").notNull(),
  content: text("content").notNull(),
  isSpectator: boolean("is_spectator").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
}).extend({
  isSpectator: z.boolean().optional(),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Room = typeof rooms.$inferSelect;
export type Player = typeof players.$inferSelect;

export type CreateRoomRequest = {
  settings: {
    mafiaCount: number;
    detectiveCount: number;
    doctorCount: number;
    civilianCount: number;
    phaseDuration: number;
    mafiaDuration: number;
    doctorDuration: number;
    detectiveDuration: number;
  };
};

export type JoinRoomRequest = {
  code: string;
  name: string;
  avatar: string;
  avatarConfig?: {
    accessory?: string;
    clothing?: string;
    bg?: string;
  };
};

export type GameAction = 
  | { type: 'vote'; targetId: number }
  | { type: 'kill'; targetId: number }
  | { type: 'heal'; targetId: number }
  | { type: 'check'; targetId: number }
  | { type: 'skip' }
  | { type: 'add_bots' }
  | { type: 'remove_bot'; playerId: number }
  | { type: 'replay' }
  | { type: 'chat'; content: string }
  | { type: 'update_profile'; name?: string; avatar?: string; avatarConfig?: any };

// WebSocket Message Types
export const WS_EVENTS = {
  CONNECT: 'connect',
  JOIN: 'join',
  START_GAME: 'start_game',
  ACTION: 'action', // vote, kill, heal, check, chat
  STATE_UPDATE: 'state_update',
  ERROR: 'error',
} as const;

export type GameState = {
  room: Room;
  players: Player[];
  messages: Message[];
  me?: Player;
};
