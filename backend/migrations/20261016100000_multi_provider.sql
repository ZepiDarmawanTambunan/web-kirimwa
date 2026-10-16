ALTER TABLE devices
    ADD COLUMN provider ENUM('baileys', 'meta_cloud') NOT NULL DEFAULT 'baileys' AFTER phone_number,
    ADD COLUMN meta_phone_number_id VARCHAR(64) NULL AFTER provider,
    ADD COLUMN meta_access_token_encrypted TEXT NULL AFTER meta_phone_number_id,
    ADD COLUMN connection_status VARCHAR(32) NOT NULL DEFAULT 'disconnected' AFTER is_active,
    ADD UNIQUE INDEX uq_devices_user_phone (user_id, phone_number),
    ADD INDEX idx_devices_user_created (user_id, created_at DESC);

ALTER TABLE messages
    ADD COLUMN device_id CHAR(36) NULL AFTER user_id,
    ADD CONSTRAINT fk_messages_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL,
    ADD INDEX idx_messages_user_device_created (user_id, device_id, created_at DESC);
