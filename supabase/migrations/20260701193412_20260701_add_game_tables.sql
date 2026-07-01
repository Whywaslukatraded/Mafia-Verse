-- Create game tables for Mafia Verse
-- Users table (for local auth fallback)
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  email text,
  password_hash text NOT NULL,
  name text NOT NULL,
  avatar text NOT NULL,
  avatar_config jsonb DEFAULT '{}',
  wins integer DEFAULT 0,
  games_played integer DEFAULT 0,
  credits integer DEFAULT 0,
  supabase_user_id text,
  achievements jsonb DEFAULT '[]',
  reset_token text,
  reset_token_expires timestamp,
  totp_secret text,
  is_2fa_enabled boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- User MFA table (for 2FA with Supabase users)
CREATE TABLE IF NOT EXISTS user_mfa (
  supabase_user_id text PRIMARY KEY,
  totp_secret text,
  is_enabled boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'lobby',
  phase text DEFAULT 'lobby',
  turn integer DEFAULT 1,
  settings jsonb NOT NULL,
  last_updated timestamp DEFAULT now()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id serial PRIMARY KEY,
  room_id integer NOT NULL,
  name text NOT NULL,
  avatar text,
  avatar_config jsonb DEFAULT '{}',
  role text,
  is_alive boolean DEFAULT true,
  is_host boolean DEFAULT false,
  session_id text NOT NULL,
  supabase_user_id text,
  is_spectator boolean DEFAULT false,
  is_bot boolean DEFAULT false,
  wins integer DEFAULT 0,
  games_played integer DEFAULT 0,
  credits integer DEFAULT 0,
  achievements jsonb DEFAULT '[]',
  game_history jsonb DEFAULT '[]',
  joined_at timestamp DEFAULT now()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  room_id integer NOT NULL,
  player_id integer NOT NULL,
  player_name text NOT NULL,
  content text NOT NULL,
  is_spectator boolean DEFAULT false,
  timestamp timestamp DEFAULT now()
);

-- Ad claims table (for daily credit claims)
CREATE TABLE IF NOT EXISTS ad_claims (
  id serial PRIMARY KEY,
  session_id text NOT NULL,
  claim_date text NOT NULL,
  claim_count integer NOT NULL DEFAULT 0,
  last_claim_at timestamp DEFAULT now(),
  UNIQUE(session_id, claim_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_session_id ON players(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);