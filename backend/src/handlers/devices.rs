use crate::{
    error::ApiError,
    extractors::ApiJson,
    models::User,
    repository::devices::{self, Device, DeviceSummary},
    services::{credentials, providers},
    AppState,
};
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct DeviceRequest {
    pub device_name: String,
    pub phone_number: String,
    pub provider: String,
    pub meta_phone_number_id: Option<String>,
    pub meta_access_token: Option<String>,
}

#[derive(Serialize)]
pub struct DeviceResponse {
    pub id: String,
    pub device_name: String,
    pub phone_number: String,
    pub provider: String,
    pub is_active: bool,
    pub connection_status: String,
}

pub async fn register_device(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    ApiJson(request): ApiJson<DeviceRequest>,
) -> Result<Json<DeviceResponse>, ApiError> {
    let device_name = request.device_name.trim();
    let phone_number = normalize_phone(&request.phone_number).ok_or_else(|| {
        ApiError::BadRequest("phone_number must be an international number".into())
    })?;
    if device_name.is_empty() || device_name.len() > 255 {
        return Err(ApiError::BadRequest(
            "device_name must contain 1 to 255 characters".into(),
        ));
    }

    let (meta_phone_number_id, meta_access_token_encrypted, connection_status) =
        match request.provider.as_str() {
            "meta_cloud" => {
                let phone_number_id = request
                    .meta_phone_number_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| {
                        !value.is_empty()
                            && value.len() <= 64
                            && value.bytes().all(|byte| byte.is_ascii_digit())
                    })
                    .ok_or_else(|| {
                        ApiError::BadRequest("a valid Meta Phone Number ID is required".into())
                    })?;
                let token = request
                    .meta_access_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| (20..=4096).contains(&value.len()))
                    .ok_or_else(|| {
                        ApiError::BadRequest("a valid Meta access token is required".into())
                    })?;
                (
                    Some(phone_number_id.to_string()),
                    Some(
                        credentials::encrypt(token, &state.config.device_credentials_key)
                            .map_err(|_| ApiError::Internal)?,
                    ),
                    "configured".to_string(),
                )
            }
            "baileys"
                if request.meta_phone_number_id.is_none()
                    && request.meta_access_token.is_none() =>
            {
                (None, None, "disconnected".to_string())
            }
            "baileys" => {
                return Err(ApiError::BadRequest(
                    "Meta credentials must not be provided for a Baileys device".into(),
                ));
            }
            _ => {
                return Err(ApiError::BadRequest(
                    "provider must be 'meta_cloud' or 'baileys'".into(),
                ));
            }
        };

    let id = Uuid::new_v4().to_string();
    let device = Device {
        id: id.clone(),
        user_id: user.id.clone(),
        device_name: device_name.to_string(),
        phone_number,
        provider: request.provider,
        meta_phone_number_id,
        meta_access_token_encrypted,
        is_active: true,
        connection_status: connection_status.clone(),
    };
    devices::insert(&state.pool, &device).await?;

    let connection_status = if device.provider == "baileys" {
        match providers::start_baileys_session(&state, &id).await {
            Ok(session) => {
                devices::set_status(&state.pool, &id, &user.id, &session.status).await?;
                session.status
            }
            Err(error) => {
                devices::delete(&state.pool, &id, &user.id).await?;
                return Err(error);
            }
        }
    } else {
        connection_status
    };

    Ok(Json(DeviceResponse {
        id,
        device_name: device.device_name,
        phone_number: device.phone_number,
        provider: device.provider,
        is_active: true,
        connection_status,
    }))
}

pub async fn list_devices(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<Vec<DeviceSummary>>, ApiError> {
    Ok(Json(devices::list_for_user(&state.pool, &user.id).await?))
}

pub async fn connect_device(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Result<Json<providers::SessionStatus>, ApiError> {
    let device = owned_device(&state, &user.id, &id).await?;
    if device.provider != "baileys" {
        return Err(ApiError::BadRequest(
            "only Baileys devices use QR pairing".into(),
        ));
    }
    let session = providers::start_baileys_session(&state, &id).await?;
    devices::set_status(&state.pool, &id, &user.id, &session.status).await?;
    Ok(Json(session))
}

pub async fn device_status(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Result<Json<providers::SessionStatus>, ApiError> {
    let device = owned_device(&state, &user.id, &id).await?;
    if device.provider == "meta_cloud" {
        return Ok(Json(providers::SessionStatus {
            status: device.connection_status,
            qr_code: None,
            cached_messages: None,
        }));
    }
    let session = providers::baileys_session_status(&state, &id).await?;
    devices::set_status(&state.pool, &id, &user.id, &session.status).await?;
    Ok(Json(session))
}

pub async fn delete_device(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Result<axum::http::StatusCode, ApiError> {
    let device = owned_device(&state, &user.id, &id).await?;
    if device.provider == "baileys" {
        providers::delete_baileys_session(&state, &id).await?;
    }
    devices::delete(&state.pool, &id, &user.id).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

async fn owned_device(state: &AppState, user_id: &str, id: &str) -> Result<Device, ApiError> {
    devices::by_id_for_user(&state.pool, user_id, id)
        .await?
        .ok_or(ApiError::NotFound)
}

fn normalize_phone(value: &str) -> Option<String> {
    let digits = value.trim().strip_prefix('+').unwrap_or(value.trim());
    ((8..=16).contains(&digits.len())
        && !digits.starts_with('0')
        && digits.bytes().all(|byte| byte.is_ascii_digit()))
    .then(|| digits.to_string())
}
