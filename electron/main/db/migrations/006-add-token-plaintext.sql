-- 005-add-token-plaintext.sql
-- Add token_plaintext column to pairing_tokens for display purposes only
ALTER TABLE pairing_tokens ADD COLUMN token_plaintext TEXT;
