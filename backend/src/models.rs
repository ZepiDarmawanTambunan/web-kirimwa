use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub is_active: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Message {
    pub id: String,
    pub device_id: Option<String>,
    pub target: String,
    pub body: String,
    pub provider_id: Option<String>,
    pub status: String,
    pub state: Option<String>,
    pub created_at: DateTime<Utc>,
}
