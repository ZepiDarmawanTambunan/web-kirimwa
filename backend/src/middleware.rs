use crate::{
    error::ApiError,
    repository::users,
    services::auth::{hash_api_key, Claims},
    AppState,
};
use axum::{
    extract::{Request, State},
    http::{header, HeaderMap},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};

pub async fn session_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let cookie = request
        .headers()
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let token = cookie
        .split(';')
        .filter_map(|entry| entry.trim().split_once('='))
        .find(|(name, _)| *name == "session")
        .map(|(_, value)| value)
        .ok_or(ApiError::Unauthorized)?;
    let claims = decode::<Claims>(
        token,
        &DecodingKey::from_secret(&state.config.jwt_secret),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized)?
    .claims;
    let user = users::by_id(&state.pool, &claims.sub)
        .await?
        .filter(|user| user.is_active)
        .ok_or(ApiError::Unauthorized)?;
    request.extensions_mut().insert(user);
    Ok(next.run(request).await)
}

pub async fn message_auth(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let headers: &HeaderMap = request.headers();
    let key = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .or_else(|| {
            headers
                .get("x-api-key")
                .and_then(|value| value.to_str().ok())
        });
    if let Some(key) = key {
        let user = users::by_api_key_hash(&state.pool, &hash_api_key(key))
            .await?
            .filter(|user| user.is_active)
            .ok_or(ApiError::Unauthorized)?;
        request.extensions_mut().insert(user);
        return Ok(next.run(request).await);
    }
    session_auth(State(state), request, next).await
}
