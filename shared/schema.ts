import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const MAX_PLAYERS_PER_ROOM = 20;

// === TABLE DEFINITIONS ===

export const userMfa = pgTable("user_mfa", {
  supabaseUserId: text("supabase_user_id").primaryKey(),
  totpSecret: text("totp_secret"),
  isEnabled: boolean("is_enabled").default(false),
  // Feature: Email 2FA option (in addition to Google Authenticator)
  // "totp" = Authenticator app, "email" = code sent to Gmail/email. User picks one.
  mfaMethod: text("mfa_method").default("totp"),
  mfaEmail: text("mfa_email"),
  emailCode: text("email_code"),
  emailCodeExpires: timestamp("email_code_expires"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  avatarConfig: jsonb("avatar_config").$type<{
    accessory?: string;
    clothing?: string;
    bg?: string;
  }>(),
  wins: integer("wins").default(0),
  gamesPlayed: integer("games_played").default(0),
  credits: integer("credits").default(0),
  supabaseUserId: text("supabase_user_id"),
  achievements: jsonb("achievements").default([]),
  // Password reset
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires"),
  // Two-factor auth
  totpSecret: text("totp_secret"),
  is2FAEnabled: boolean("is_2fa_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

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
    language?: string;
    // New roles (all optional, default 0 if unset)
    bodyguardCount?: number;
    vigilanteCount?: number;
    mayorCount?: number;
    jesterCount?: number;
    bodyguardDuration?: number;
    vigilanteDuration?: number;
    // Feature: Discussion timer. Falls back to phaseDuration server-side if
    // unset, so this stays optional for backward compatibility with rooms
    // created before this field existed.
    discussionDuration?: number;
    // Feature: Bot personality — alters chat tone/behavior tendencies only.
    // Undefined/unset means "use current default behavior" (unchanged).
    botPersonality?: "chill" | "aggressiveLiar" | "chaotic";
  }>(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
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
  sessionId: text("session_id").notNull(),
  supabaseUserId: text("supabase_user_id"),
  isSpectator: boolean("is_spectator").default(false),
  isBot: boolean("is_bot").default(false),
  // Feature: Pre-game ready-up lobby. Only meaningful while room.status is
  // "lobby" — reset to false whenever a player disconnects during the lobby
  // phase (see routes.ts ws.on('close')), so readiness always reflects
  // someone actively engaged right now, not a stale click from before a drop.
  isReady: boolean("is_ready").default(false),
  wins: integer("wins").default(0),
  gamesPlayed: integer("games_played").default(0),
  // Feature: Per-role stats. Keyed by role ("mafia", "detective", "civilian",
  // etc.) -> { wins, gamesPlayed } for that role specifically, alongside the
  // existing all-roles totals above. Defaults to {} for both brand-new
  // players and every existing player at migration time — the profile page
  // should treat a missing/empty entry for a role as "not tracked yet"
  // rather than "0 games", since games played before this feature shipped
  // aren't retroactively broken out by role.
  roleStats: jsonb("role_stats").$type<Record<string, { wins: number; gamesPlayed: number }>>().default({}),
  credits: integer("credits").default(0),
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
  isMafiaChat: boolean("is_mafia_chat").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const adClaims = pgTable("ad_claims", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  claimDate: text("claim_date").notNull(),
  claimCount: integer("claim_count").notNull().default(0),
  lastClaimAt: timestamp("last_claim_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
}).extend({
  isSpectator: z.boolean().optional(),
  isMafiaChat: z.boolean().optional(),
});

export type User = typeof users.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type AdClaim = typeof adClaims.$inferSelect;

export type Room = typeof rooms.$inferSelect;
export type Player = typeof players.$inferSelect;
export type RoleStatEntry = { wins: number; gamesPlayed: number };

export type CreateRoomRequest = {
  name: string;
  avatar: string;
  avatarConfig?: {
    accessory?: string;
    clothing?: string;
    bg?: string;
  };
  settings: {
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
    language?: string;
    // New roles (all optional, default 0 if unset)
    bodyguardCount?: number;
    vigilanteCount?: number;
    mayorCount?: number;
    jesterCount?: number;
    bodyguardDuration?: number;
    vigilanteDuration?: number;
    discussionDuration?: number;
    botPersonality?: "chill" | "aggressiveLiar" | "chaotic";
  };
};

export type ForgotPasswordRequest = {
  username: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type Setup2FARequest = {
  userId: number;
};

export type Verify2FARequest = {
  userId: number;
  code: string;
};

export type Login2FARequest = {
  username: string;
  password: string;
  totpCode: string;
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
  | { type: 'chat'; content: string; channel?: 'game' | 'mafia' }
  | { type: 'report_afk'; targetId: number }
  | { type: 'unreport_afk'; targetId: number }
  | { type: 'bodyguard_protect'; targetId: number }
  | { type: 'vigilante_shoot'; targetId: number }
  | { type: 'mayor_reveal' }
  | { type: 'update_profile'; name?: string; avatar?: string; avatarConfig?: any }
  // Feature: Pre-game ready-up lobby
  | { type: 'ready_toggle' }
  | { type: 'start_now' };

// WebSocket Message Types
export const WS_EVENTS = {
  CONNECT: 'connect',
  JOIN: 'join',
  START_GAME: 'start_game',
  ACTION: 'action',
  STATE_UPDATE: 'state_update',
  ERROR: 'error',
} as const;

export type GameState = {
  room: Room;
  players: Player[];
  messages: Message[];
  me?: Player;
  revealedMayorIds?: number[];
  myBullets?: number;
  mafiaChatAvailable?: boolean;
  mafiaTeammatesActedIds?: number[];
  // Feature: Pre-game ready-up lobby. When set, all connected human players
  // are ready and bots will fill remaining slots + the game will start at
  // this timestamp (epoch ms) unless the host hits "Start Now" first or
  // someone un-readies/disconnects, which cancels it (null again).
  lobbyCountdownEndsAt?: number | null;
};
