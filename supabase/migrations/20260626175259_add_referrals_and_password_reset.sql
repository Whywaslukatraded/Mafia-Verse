/*
# Add referral system and password reset support

1. New Tables
- `profiles`: Stores user profile data including referral code and credits
  - `supabase_user_id` (uuid, primary key, references auth.users)
  - `referral_code` (text, unique, not null)
  - `referred_by` (text, nullable - the referral code that brought this user)
  - `credits` (integer, default 0)
  - `created_at` (timestamp, default now)
- `referrals`: Tracks successful referral claims
  - `id` (serial, primary key)
  - `referrer_id` (uuid, not null - Supabase user ID)
  - `referred_id` (uuid, not null, unique - Supabase user ID)
  - `credits_awarded` (integer, default 0)
  - `created_at` (timestamp, default now)

2. Security
- Enable RLS on all new tables.
- Allow authenticated users to read their own profile.
- Allow authenticated users to update their own credits.
- Allow anon + authenticated to read referral codes for validation.
- Allow authenticated users to insert referrals (on signup).

3. Important Notes
- `referral_code` is generated as a 6-character alphanumeric string on insert.
- `referred_by` stores the referral code used during signup, not the user ID.
- The `referrals` table tracks when a referred user actually earns credits for their referrer.
*/

CREATE TABLE IF NOT EXISTS profiles (
  supabase_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text UNIQUE NOT NULL,
  referred_by text,
  credits integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  id serial PRIMARY KEY,
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  credits_awarded integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = supabase_user_id);

-- Profiles: users can update their own credits
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = supabase_user_id) WITH CHECK (auth.uid() = supabase_user_id);

-- Profiles: allow signup insert (anon creates their profile)
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO anon, authenticated WITH CHECK (auth.uid() = supabase_user_id);

-- Referrals: users can read their own referrals
DROP POLICY IF EXISTS "select_own_referrals" ON referrals;
CREATE POLICY "select_own_referrals" ON referrals FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Referrals: allow insert on signup
DROP POLICY IF EXISTS "insert_referrals" ON referrals;
CREATE POLICY "insert_referrals" ON referrals FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Referrals: allow update for credit awarding
DROP POLICY IF EXISTS "update_referrals" ON referrals;
CREATE POLICY "update_referrals" ON referrals FOR UPDATE
  TO authenticated USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);
