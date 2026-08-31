-- Add account_id to google_task_lists so tasks can be linked back to their account
ALTER TABLE google_task_lists ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX idx_google_task_lists_account_id ON google_task_lists(account_id);
