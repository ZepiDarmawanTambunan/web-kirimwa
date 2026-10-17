use crate::{error::ApiError, repository::devices::Device, services::credentials, AppState};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionStatus {
    pub status: String,
    pub qr_code: Option<String>,
    /// Jumlah pesan terkirim yang masih disimpan gateway.
    ///
    /// Cache ini dipakai Baileys untuk menjawab "retry receipt" WhatsApp; bila habis
    /// (mis. setelah gateway restart) penerima bisa melihat "Menunggu pesan ini".
    #[serde(default)]
    pub cached_messages: Option<u64>,
    /// Apakah kredensial perangkat masih terdaftar di WhatsApp.
    #[serde(default)]
    pub paired: Option<bool>,
    /// Berapa kali gateway menautkan ulang perangkat (QR baru) otomatis.
    #[serde(default)]
    pub auto_repairs: Option<u64>,
    /// Alasan putus terakhir dari WhatsApp, mis. `loggedOut` atau `connectionClosed`.
    #[serde(default)]
    pub last_close_reason: Option<String>,
    /// Diagnostik terakhir dari gateway (mis. `reconnect_exhausted:connectionLost`).
    #[serde(default)]
    pub last_error: Option<String>,
    /// Jumlah pesan yang gagal didekripsi — indikasi sesi Baileys tidak sehat.
    #[serde(default)]
    pub decrypt_failures: Option<u64>,
    /// Berapa kali WhatsApp meminta ulang pesan masuk yang tidak ada di cache.
    #[serde(default)]
    pub getmessage_misses: Option<u64>,
}

#[derive(Deserialize)]
struct GatewaySendResponse {
    message_id: String,
}

#[derive(Deserialize)]
struct MetaSendResponse {
    messages: Vec<MetaMessage>,
}

#[derive(Deserialize)]
struct MetaMessage {
    id: String,
}

pub async fn start_baileys_session(
    state: &AppState,
    device_id: &str,
) -> Result<SessionStatus, ApiError> {
    let response = state
        .http
        .post(format!(
            "{}/sessions/{device_id}",
            state.config.gateway_url.trim_end_matches('/')
        ))
        .bearer_auth(&state.config.gateway_token)
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, "Baileys gateway is unavailable");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), "Baileys session start failed");
        return Err(ApiError::Upstream);
    }
    response.json().await.map_err(|error| {
        tracing::error!(%error, "Invalid Baileys session response");
        ApiError::Upstream
    })
}

pub async fn baileys_session_status(
    state: &AppState,
    device_id: &str,
) -> Result<SessionStatus, ApiError> {
    let response = state
        .http
        .get(format!(
            "{}/sessions/{device_id}",
            state.config.gateway_url.trim_end_matches('/')
        ))
        .bearer_auth(&state.config.gateway_token)
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, "Baileys gateway is unavailable");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), "Baileys session status failed");
        return Err(ApiError::Upstream);
    }
    response.json().await.map_err(|error| {
        tracing::error!(%error, "Invalid Baileys session status response");
        ApiError::Upstream
    })
}

/// Memaksa gateway membuang kredensial lokal dan menautkan ulang perangkat,
/// sehingga WhatsApp mengeluarkan QR baru untuk dipindai.
pub async fn restart_baileys_session(
    state: &AppState,
    device_id: &str,
) -> Result<SessionStatus, ApiError> {
    let response = state
        .http
        .post(format!(
            "{}/sessions/{device_id}/reset",
            state.config.gateway_url.trim_end_matches('/')
        ))
        .bearer_auth(&state.config.gateway_token)
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, device_id, "Baileys gateway is unavailable during relink");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), device_id, "Baileys session relink failed");
        return Err(ApiError::Upstream);
    }
    response.json().await.map_err(|error| {
        tracing::error!(%error, device_id, "Invalid Baileys session relink response");
        ApiError::Upstream
    })
}

pub async fn delete_baileys_session(state: &AppState, device_id: &str) -> Result<(), ApiError> {
    let response = state
        .http
        .delete(format!(
            "{}/sessions/{device_id}",
            state.config.gateway_url.trim_end_matches('/')
        ))
        .bearer_auth(&state.config.gateway_token)
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, "Baileys gateway is unavailable during device deletion");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), "Baileys session deletion failed");
        return Err(ApiError::Upstream);
    }
    Ok(())
}

pub async fn send(
    state: &AppState,
    device: &Device,
    target: &str,
    message: &str,
) -> Result<(String, &'static str), ApiError> {
    match device.provider.as_str() {
        "meta_cloud" => send_meta(state, device, target, message).await,
        "baileys" => send_baileys(state, device, target, message).await,
        _ => Err(ApiError::BadRequest(
            "device uses an unsupported provider".to_string(),
        )),
    }
}

async fn send_meta(
    state: &AppState,
    device: &Device,
    target: &str,
    message: &str,
) -> Result<(String, &'static str), ApiError> {
    let phone_number_id = device
        .meta_phone_number_id
        .as_deref()
        .ok_or(ApiError::Conflict)?;
    let encrypted_token = device
        .meta_access_token_encrypted
        .as_deref()
        .ok_or(ApiError::Conflict)?;
    let access_token = credentials::decrypt(encrypted_token, &state.config.device_credentials_key)
        .map_err(|_| {
            tracing::error!(device_id = %device.id, "Unable to decrypt Meta access token");
            ApiError::Internal
        })?;
    let response = state
        .http
        .post(format!(
            "https://graph.facebook.com/{}/{phone_number_id}/messages",
            state.config.meta_graph_api_version
        ))
        .bearer_auth(access_token)
        .json(&serde_json::json!({
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": target,
            "type": "text",
            "text": {
                "preview_url": false,
                "body": message
            }
        }))
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, device_id = %device.id, "Meta Cloud API request failed");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), device_id = %device.id, "Meta Cloud API rejected message");
        return Err(ApiError::Upstream);
    }
    let payload: MetaSendResponse = response.json().await.map_err(|error| {
        tracing::error!(%error, device_id = %device.id, "Invalid Meta Cloud API response");
        ApiError::Upstream
    })?;
    let provider_id = payload
        .messages
        .into_iter()
        .next()
        .map(|message| message.id)
        .filter(|id| !id.is_empty())
        .ok_or(ApiError::Upstream)?;
    Ok((provider_id, "Accepted"))
}

async fn send_baileys(
    state: &AppState,
    device: &Device,
    target: &str,
    message: &str,
) -> Result<(String, &'static str), ApiError> {
    let response = state
        .http
        .post(format!(
            "{}/sessions/{}/messages",
            state.config.gateway_url.trim_end_matches('/'),
            device.id
        ))
        .bearer_auth(&state.config.gateway_token)
        .json(&serde_json::json!({ "target": target, "message": message }))
        .send()
        .await
        .map_err(|error| {
            tracing::error!(%error, device_id = %device.id, "Baileys gateway send failed");
            ApiError::Upstream
        })?;
    if !response.status().is_success() {
        tracing::error!(status = %response.status(), device_id = %device.id, "Baileys gateway rejected message");
        return Err(ApiError::Upstream);
    }
    let payload: GatewaySendResponse = response.json().await.map_err(|error| {
        tracing::error!(%error, device_id = %device.id, "Invalid Baileys gateway send response");
        ApiError::Upstream
    })?;
    if payload.message_id.is_empty() {
        return Err(ApiError::Upstream);
    }
    Ok((payload.message_id, "Accepted"))
}
