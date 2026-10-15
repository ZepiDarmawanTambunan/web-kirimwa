CREATE TABLE users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    api_key_hash CHAR(64) NULL UNIQUE,
    api_key_prefix VARCHAR(12) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    target VARCHAR(32) NOT NULL,
    body TEXT NOT NULL,
    provider_id VARCHAR(128) NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'Processing',
    state VARCHAR(64) NULL,
    state_id VARCHAR(128) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_messages_user_created (user_id, created_at DESC),
    INDEX idx_messages_provider_id (provider_id)
);

CREATE TABLE pending_webhook_status (
    provider_id VARCHAR(128) NOT NULL PRIMARY KEY,
    state_id VARCHAR(128) NULL,
    status VARCHAR(32) NULL,
    state VARCHAR(64) NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pending_webhook_state_id (state_id)
);
