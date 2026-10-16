-- Convert TIMESTAMP columns to DATETIME to match NaiveDateTime model type

ALTER TABLE users
    MODIFY COLUMN created_at DATETIME NOT NULL;

ALTER TABLE messages
    MODIFY COLUMN created_at DATETIME NOT NULL,
    MODIFY COLUMN updated_at DATETIME NOT NULL;

ALTER TABLE pending_webhook_status
    MODIFY COLUMN received_at DATETIME NOT NULL;

ALTER TABLE devices
    MODIFY COLUMN created_at DATETIME NOT NULL;
