use crate::error::ApiError;
use sqlx::MySqlPool;

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Device {
    pub id: String,
    pub user_id: String,
    pub device_name: String,
    pub phone_number: String,
    pub provider: String,
    pub meta_phone_number_id: Option<String>,
    pub meta_access_token_encrypted: Option<String>,
    pub is_active: bool,
    pub connection_status: String,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct DeviceSummary {
    pub id: String,
    pub device_name: String,
    pub phone_number: String,
    pub provider: String,
    pub is_active: bool,
    pub connection_status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn insert(pool: &MySqlPool, device: &Device) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO devices (id, user_id, device_name, phone_number, provider, meta_phone_number_id, meta_access_token_encrypted, session_path, connection_status) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&device.id)
    .bind(&device.user_id)
    .bind(&device.device_name)
    .bind(&device.phone_number)
    .bind(&device.provider)
    .bind(&device.meta_phone_number_id)
    .bind(&device.meta_access_token_encrypted)
    .bind(format!("auth_{}", device.id))
    .bind(&device.connection_status)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_for_user(
    pool: &MySqlPool,
    user_id: &str,
) -> Result<Vec<DeviceSummary>, ApiError> {
    Ok(sqlx::query_as::<_, DeviceSummary>(
        "SELECT id, device_name, phone_number, provider, is_active, connection_status, created_at \
         FROM devices WHERE user_id = ? ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

pub async fn by_id_for_user(
    pool: &MySqlPool,
    user_id: &str,
    id: &str,
) -> Result<Option<Device>, ApiError> {
    Ok(sqlx::query_as::<_, Device>(
        "SELECT id, user_id, device_name, phone_number, provider, meta_phone_number_id, \
         meta_access_token_encrypted, is_active, connection_status FROM devices WHERE id = ? AND user_id = ?",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

pub async fn set_status(
    pool: &MySqlPool,
    id: &str,
    user_id: &str,
    status: &str,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE devices SET connection_status = ? WHERE id = ? AND user_id = ?")
        .bind(status)
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &MySqlPool, id: &str, user_id: &str) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM devices WHERE id = ? AND user_id = ?")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}
