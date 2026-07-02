/*
# Add explicit deny policies for backend-only tables

## Summary
Six tables (users, user_mfa, rooms, players, messages, ad_claims) are accessed exclusively
by the Express backend via a direct PostgreSQL connection (SUPABASE_DB_URL / DATABASE_URL).
Direct connections run as the database owner, which bypasses RLS entirely — the backend is
unaffected by any policies here.

RLS was enabled on these tables in the previous migration. The security scanner now flags them
as "RLS enabled but no policies exist", which it treats as a misconfiguration even though the
correct PostgreSQL behavior (deny all by default) is already in effect.

## Changes
Each table gets one explicit policy per operation (SELECT, INSERT, UPDATE, DELETE) with
`USING (false)` / `WITH CHECK (false)` scoped to `anon` and `authenticated` roles.
This makes the intent unambiguous: no Supabase REST API client (anon key or user JWT)
can read or write these tables. The service_role key and direct DB connections are exempt
from RLS and are unaffected.

## Security Notes
- `service_role` bypasses RLS by design in Supabase — backend still has full access.
- `anon` and `authenticated` roles are explicitly blocked from all operations.
- No data is exposed or removed; this is a documentation-of-intent change only.
*/

-- ── users ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_users" ON public.users;
DROP POLICY IF EXISTS "deny_anon_insert_users" ON public.users;
DROP POLICY IF EXISTS "deny_anon_update_users" ON public.users;
DROP POLICY IF EXISTS "deny_anon_delete_users" ON public.users;

CREATE POLICY "deny_anon_select_users" ON public.users
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_users" ON public.users
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_users" ON public.users
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_users" ON public.users
  FOR DELETE TO anon, authenticated USING (false);

-- ── user_mfa ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_user_mfa" ON public.user_mfa;
DROP POLICY IF EXISTS "deny_anon_insert_user_mfa" ON public.user_mfa;
DROP POLICY IF EXISTS "deny_anon_update_user_mfa" ON public.user_mfa;
DROP POLICY IF EXISTS "deny_anon_delete_user_mfa" ON public.user_mfa;

CREATE POLICY "deny_anon_select_user_mfa" ON public.user_mfa
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_user_mfa" ON public.user_mfa
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_user_mfa" ON public.user_mfa
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_user_mfa" ON public.user_mfa
  FOR DELETE TO anon, authenticated USING (false);

-- ── rooms ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_rooms" ON public.rooms;
DROP POLICY IF EXISTS "deny_anon_insert_rooms" ON public.rooms;
DROP POLICY IF EXISTS "deny_anon_update_rooms" ON public.rooms;
DROP POLICY IF EXISTS "deny_anon_delete_rooms" ON public.rooms;

CREATE POLICY "deny_anon_select_rooms" ON public.rooms
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_rooms" ON public.rooms
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_rooms" ON public.rooms
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_rooms" ON public.rooms
  FOR DELETE TO anon, authenticated USING (false);

-- ── players ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_players" ON public.players;
DROP POLICY IF EXISTS "deny_anon_insert_players" ON public.players;
DROP POLICY IF EXISTS "deny_anon_update_players" ON public.players;
DROP POLICY IF EXISTS "deny_anon_delete_players" ON public.players;

CREATE POLICY "deny_anon_select_players" ON public.players
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_players" ON public.players
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_players" ON public.players
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_players" ON public.players
  FOR DELETE TO anon, authenticated USING (false);

-- ── messages ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_messages" ON public.messages;
DROP POLICY IF EXISTS "deny_anon_insert_messages" ON public.messages;
DROP POLICY IF EXISTS "deny_anon_update_messages" ON public.messages;
DROP POLICY IF EXISTS "deny_anon_delete_messages" ON public.messages;

CREATE POLICY "deny_anon_select_messages" ON public.messages
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_messages" ON public.messages
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_messages" ON public.messages
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_messages" ON public.messages
  FOR DELETE TO anon, authenticated USING (false);

-- ── ad_claims ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deny_anon_select_ad_claims" ON public.ad_claims;
DROP POLICY IF EXISTS "deny_anon_insert_ad_claims" ON public.ad_claims;
DROP POLICY IF EXISTS "deny_anon_update_ad_claims" ON public.ad_claims;
DROP POLICY IF EXISTS "deny_anon_delete_ad_claims" ON public.ad_claims;

CREATE POLICY "deny_anon_select_ad_claims" ON public.ad_claims
  FOR SELECT TO anon, authenticated USING (false);

CREATE POLICY "deny_anon_insert_ad_claims" ON public.ad_claims
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "deny_anon_update_ad_claims" ON public.ad_claims
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_anon_delete_ad_claims" ON public.ad_claims
  FOR DELETE TO anon, authenticated USING (false);
