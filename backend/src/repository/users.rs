use crate::{error::ApiError, models::User};
use chrono::{DateTime, Utc};
use sqlx::MySqlPool;

pub async fn by_email(pool: &MySqlPool, email: &str) -> Result<Option<User>, ApiError> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, is_active, api_key_hash, api_key_prefix FROM users WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?)
}

pub async fn by_api_key_hash(pool: &MySqlPool, hash: &str) -> Result<Option<User>, ApiError> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, is_active, api_key_hash, api_key_prefix FROM users WHERE api_key_hash = ?",
    )
    .bind(hash)
    .fetch_optional(pool)
    .await?)
}

pub async fn by_id(pool: &MySqlPool, id: &str) -> Result<Option<User>, ApiError> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, is_active, api_key_hash, api_key_prefix FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct AdminUser {
    pub id: String,
    pub email: String,
    pub role: String,
    pub is_active: bool,
    pub api_key_prefix: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
}

pub async fn list(pool: &MySqlPool) -> Result<Vec<AdminUser>, ApiError> {
    Ok(sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, role, is_active, api_key_prefix, created_at FROM users ORDER BY created_at DESC LIMIT 500",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn set_active(pool: &MySqlPool, id: &str, active: bool) -> Result<bool, ApiError> {
    let result = sqlx::query("UPDATE users SET is_active = ? WHERE id = ?")
        .bind(active)
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() > 0 {
        return Ok(true);
    }
    Ok(
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id = ?)")
            .bind(id)
            .fetch_one(pool)
            .await?,
    )
}

pub async fn create(
    pool: &MySqlPool,
    id: &str,
    email: &str,
    password_hash: &str,
    role: &str,
) -> Result<(), ApiError> {
    let result =
        sqlx::query("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)")
            .bind(id)
            .bind(email)
            .bind(password_hash)
            .bind(role)
            .execute(pool)
            .await;
    match result {
        Ok(_) => Ok(()),
        Err(sqlx::Error::Database(error)) if error.code().as_deref() == Some("1062") => {
            Err(ApiError::Conflict)
        }
        Err(error) => Err(error.into()),
    }
}

pub async fn set_api_key(
    pool: &MySqlPool,
    user_id: &str,
    hash: &str,
    prefix: &str,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE users SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?")
        .bind(hash)
        .bind(prefix)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}
