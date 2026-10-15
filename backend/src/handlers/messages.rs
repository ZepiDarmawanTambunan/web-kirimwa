use crate::{
    dto::{MessageList, SendMessageRequest, SendMessageResponse},
    error::ApiError,
    extractors::ApiJson,
    models::User,
    repository::messages,
    services::wa_gateway,
    AppState,
};
use axum::{
    extract::{Extension, Path, Query, State},
    Json,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ListQuery {
    limit: Option<u32>,
}

pub async fn send(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    ApiJson(request): ApiJson<SendMessageRequest>,
) -> Result<Json<SendMessageResponse>, ApiError> {
    // Limit: 50 messages per 24 hours (default limit)
    const DAILY_LIMIT: i64 = 50;
    let count_24h = crate::repository::messages::count_recent_24h(&state.pool, &user.id).await?;
    let target_count = request.target.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).count() as i64;
    if count_24h + target_count > DAILY_LIMIT {
        return Err(ApiError::BadRequest(format!(
            "Limit harian tercapai ({} / {}). Coba lagi nanti.",
            DAILY_LIMIT, DAILY_LIMIT
        )));
    }
    let queued = wa_gateway::send(&state, &user.id, request).await?;
    Ok(Json(SendMessageResponse { messages: queued }))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Query(query): Query<ListQuery>,
) -> Result<Json<MessageList>, ApiError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 100);
    Ok(Json(MessageList {
        messages: messages::list_for_user(&state.pool, &user.id, limit).await?,
    }))
}

pub async fn get_one(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> Result<Json<crate::models::Message>, ApiError> {
    let message = messages::by_id_for_user(&state.pool, &user.id, &id)
        .await?
        .ok_or(ApiError::NotFound)?;
    Ok(Json(message))
}
