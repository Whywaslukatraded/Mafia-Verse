-- Fix unrestricted INSERT on referrals table

-- Drop the old unrestricted policy
DROP POLICY IF EXISTS "insert_referrals" ON referrals;

-- Create proper insert policy: users can only insert their own referral record
CREATE POLICY "insert_own_referral" ON referrals
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.uid() = referred_id);
