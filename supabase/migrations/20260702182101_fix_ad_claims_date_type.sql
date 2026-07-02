
-- Change ad_claims.claim_date from text to date for proper UTC-based comparisons
ALTER TABLE ad_claims ALTER COLUMN claim_date TYPE date USING claim_date::date;
