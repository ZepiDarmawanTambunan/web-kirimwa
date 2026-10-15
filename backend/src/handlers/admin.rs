use crate::{error::ApiError, extractors::ApiJson, models::User, repository::users, AppState};
use axum::{
    extract::{Extension, Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct UserStatusRequest {
    pub active: bool,
}

#[derive(Serialize)]
pub struct UserStatusResponse {
    pub id: String,
    pub active: bool,
}

pub async fn list_users(
    State(state): State<AppState>,
    Extension(actor): Extension<User>,
) -> Result<Json<Vec<users::AdminUser>>, ApiError> {
    if actor.role != "admin" {
        return Err(ApiError::Forbidden);
    }
    Ok(Json(users::list(&state.pool).await?))
}

pub async fn set_user_status(
    State(state): State<AppState>,
    Extension(actor): Extension<User>,
    Path(id): Path<String>,
    ApiJson(request): ApiJson<UserStatusRequest>,
) -> Result<Json<UserStatusResponse>, ApiError> {
    if actor.role != "admin" {
        return Err(ApiError::Forbidden);
    }
    if actor.id == id && !request.active {
        return Err(ApiError::BadRequest(
            "administrators cannot deactivate their own account".to_string(),
        ));
    }
    if !users::set_active(&state.pool, &id, request.active).await? {
        return Err(ApiError::NotFound);
    }
    Ok(Json(UserStatusResponse {
        id,
        active: request.active,
    }))
}
