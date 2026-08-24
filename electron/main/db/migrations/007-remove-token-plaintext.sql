-- 006-remove-token-plaintext.sql
-- Remove token_plaintext column from pairing_tokens (security: SEC-LAN-003)
-- Plaintext token is now stored in memory only
ALTER TABLE pairing_tokens DROP COLUMN token_plaintext;