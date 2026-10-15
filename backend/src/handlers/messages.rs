use crate::{
    dto::{MessageList, SendMessageRequest, SendMessageResponse},
    error::ApiError,
    extractors::ApiJson,
    models::User,
    repository::messages,
    services::fonnte,
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
    let queued = fonnte::send(&state, &user.id, request).await?;
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
