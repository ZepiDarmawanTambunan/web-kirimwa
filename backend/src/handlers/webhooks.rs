use crate::{
    dto::FonnteStatusWebhook, error::ApiError, extractors::ApiJson, repository::messages, AppState,
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use subtle::ConstantTimeEq;

pub async fn fonnte_status(
    State(state): State<AppState>,
    Path(secret): Path<String>,
    ApiJson(payload): ApiJson<FonnteStatusWebhook>,
) -> Result<StatusCode, ApiError> {
    if secret
        .as_bytes()
        .ct_eq(state.config.webhook_secret.as_bytes())
        .unwrap_u8()
        != 1
    {
        return Err(ApiError::Unauthorized);
    }
    let state_id = payload.stateid.as_ref().and_then(value_as_string);
    let provider_id = payload.id.as_ref().and_then(value_as_string);
    if provider_id
        .as_ref()
        .is_some_and(|id| id.is_empty() || id.len() > 128)
        || state_id
            .as_ref()
            .is_some_and(|id| id.is_empty() || id.len() > 128)
        || payload
            .status
            .as_ref()
            .is_some_and(|status| !valid_status(status))
        || payload.state.as_ref().is_some_and(|state| state.len() > 64)
    {
        return Err(ApiError::BadRequest("webhook contains invalid status data"));
    }
    let affected = if let Some(provider_id) = provider_id {
        messages::update_status(
            &state.pool,
            &provider_id,
            state_id.as_deref(),
            payload.status.as_deref(),
            payload.state.as_deref(),
        )
        .await?
    } else if let Some(state_id) = state_id.as_deref() {
        messages::update_state(&state.pool, state_id, payload.state.as_deref()).await?
    } else {
        return Err(ApiError::BadRequest("id or stateid is required"));
    };
    if !affected {
        if let Some(provider_id) = payload.id.as_ref().and_then(value_as_string) {
            messages::store_pending_status(
                &state.pool,
                &provider_id,
                state_id.as_deref(),
                payload.status.as_deref(),
                payload.state.as_deref(),
            )
            .await?;
            tracing::info!("Fonnte status was buffered until the send response is persisted");
        } else {
            tracing::warn!("Fonnte callback did not match a recorded message");
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

fn valid_status(status: &str) -> bool {
    matches!(
        status.to_ascii_lowercase().as_str(),
        "sent"
            | "processing"
            | "pending"
            | "waiting"
            | "invalid"
            | "failed"
            | "expired"
            | "url unreachable"
    )
}

fn value_as_string(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
}
