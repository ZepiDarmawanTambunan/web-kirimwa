use crate::{error::ApiError, extractors::ApiJson, AppState, models::User};
use axum::{extract::{Extension, State}, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct DeviceRequest {
    pub device_name: String,
    pub phone_number: String,
}

#[derive(Serialize)]
pub struct DeviceResponse {
    pub id: String,
    pub device_name: String,
    pub phone_number: String,
    pub is_active: bool,
}

pub async fn register_device(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    ApiJson(req): ApiJson<DeviceRequest>,
) -> Result<Json<DeviceResponse>, ApiError> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO devices (id, user_id, device_name, phone_number, session_path) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&user.id)
        .bind(req.device_name.trim())
        .bind(req.phone_number.trim())
        .bind(format!("auth_{}", id))
        .execute(&state.pool)
        .await?;
    Ok(Json(DeviceResponse {
        id,
        device_name: req.device_name.trim().to_string(),
        phone_number: req.phone_number.trim().to_string(),
        is_active: true,
    }))
}
