ALTER TABLE emails ADD COLUMN body_html TEXT;
ALTER TABLE emails ADD COLUMN attachments TEXT; -- JSON array of {filename, mimeType, size}
