-- Add services_ready column to replace docker_check_complete and n8n_health_complete
ALTER TABLE setup_status ADD COLUMN services_ready INTEGER NOT NULL DEFAULT 0;

-- Migrate existing data: if either docker_check_complete or n8n_health_complete was set,
-- mark services_ready as complete
UPDATE setup_status SET services_ready = 1
WHERE docker_check_complete = 1 OR n8n_health_complete = 1;
