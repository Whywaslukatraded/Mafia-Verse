/*
# Enable RLS on backend-only tables

## Summary
These six tables (users, user_mfa, rooms, players, messages, ad_claims) are exclusively
accessed by the Express backend via a direct PostgreSQL connection string (SUPABASE_DB_URL).
Direct PostgreSQL connections run as the database owner role and bypass RLS entirely, so
the backend is completely unaffected by enabling RLS here.

The risk being fixed: without RLS enabled, the Supabase REST API (exposed via the anon key)
allows any client to SELECT, INSERT, UPDATE, or DELETE rows in these tables directly —
bypassing all server-side validation, rate limiting, and business logic.

## Changes
- Enable RLS on: users, user_mfa, rooms, players, messages, ad_claims
- Add NO anon/authenticated policies — these are intentionally backend-only tables.
  The Supabase REST API (anon or authenticated role) will receive zero rows / permission
  denied on any direct attempt, which is correct behavior.
- The session_id columns in ad_claims and players are no longer exposed via API.

## Important Notes
1. The backend uses pg Pool with SUPABASE_DB_URL — this is a direct superuser connection
   that bypasses RLS. No backend code changes are needed.
2. The profiles and referrals tables already have RLS enabled with proper policies for
   frontend use; this migration does not touch those.
3. To add service-role-only access if needed in the future, use:
   CREATE POLICY "service_role_only" ON <table> USING (auth.role() = 'service_role');
*/

-- Enable RLS — locks down direct Supabase REST API access for all backend-only tables.
-- The backend's direct pg pool connection bypasses RLS and is unaffected.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_claims ENABLE ROW LEVEL SECURITY;

-- Drop any stale policies that might exist from previous attempts
DROP POLICY IF EXISTS "backend_only_users_select" ON public.users;
DROP POLICY IF EXISTS "backend_only_user_mfa_select" ON public.user_mfa;
DROP POLICY IF EXISTS "backend_only_rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "backend_only_players_select" ON public.players;
DROP POLICY IF EXISTS "backend_only_messages_select" ON public.messages;
DROP POLICY IF EXISTS "backend_only_ad_claims_select" ON public.ad_claims;

-- No anon/authenticated policies are added intentionally.
-- These tables are only accessible via direct DB connection (service/admin role),
-- which bypasses RLS. The Supabase REST API (anon key) gets no access at all.
