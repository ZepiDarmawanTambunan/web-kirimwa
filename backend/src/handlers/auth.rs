use crate::{
    dto::{ApiKeyResponse, AuthResponse, Credentials},
    error::ApiError,
    extractors::ApiJson,
    models::User,
    repository::users,
    services::auth::{hash_api_key, hash_password, issue_jwt, new_api_key, verify_password},
    AppState,
};
use axum::{
    extract::{Extension, State},
    http::{header, HeaderMap, HeaderValue},
    Json,
};
use regex::Regex;
use uuid::Uuid;

fn validate_credentials(credentials: &Credentials) -> Result<(String, String), ApiError> {
    let email = credentials.email.trim().to_lowercase();
    let email_pattern =
        Regex::new(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$").map_err(|_| ApiError::Internal)?;
    if !email_pattern.is_match(&email) || email.len() > 254 {
        return Err(ApiError::BadRequest("a valid email address is required"));
    }
    if !(12..=128).contains(&credentials.password.len()) {
        return Err(ApiError::BadRequest(
            "password must contain 12 to 128 characters",
        ));
    }
    Ok((email, credentials.password.clone()))
}

fn session_cookie(token: &str, secure: bool) -> Result<HeaderValue, ApiError> {
    let secure_attribute = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400{secure_attribute}"
    ))
    .map_err(|_| ApiError::Internal)
}

fn auth_response(user: &User) -> AuthResponse {
    AuthResponse {
        id: user.id.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
    }
}

pub async fn register(
    State(state): State<AppState>,
    ApiJson(credentials): ApiJson<Credentials>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let (email, password) = validate_credentials(&credentials)?;
    if users::by_email(&state.pool, &email).await?.is_some() {
        return Err(ApiError::Conflict);
    }
    let id = Uuid::new_v4().to_string();
    users::create(&state.pool, &id, &email, &hash_password(&password)?, "user").await?;
    let user = users::by_id(&state.pool, &id)
        .await?
        .ok_or(ApiError::Internal)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        session_cookie(&issue_jwt(&id, &state)?, state.config.cookie_secure)?,
    );
    Ok((headers, Json(auth_response(&user))))
}

pub async fn login(
    State(state): State<AppState>,
    ApiJson(credentials): ApiJson<Credentials>,
) -> Result<(HeaderMap, Json<AuthResponse>), ApiError> {
    let email = credentials.email.trim().to_lowercase();
    let user = users::by_email(&state.pool, &email)
        .await?
        .ok_or(ApiError::Unauthorized)?;
    if !verify_password(&credentials.password, &user.password_hash) {
        return Err(ApiError::Unauthorized);
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        session_cookie(&issue_jwt(&user.id, &state)?, state.config.cookie_secure)?,
    );
    Ok((headers, Json(auth_response(&user))))
}

pub async fn me(Extension(user): Extension<User>) -> Json<AuthResponse> {
    Json(auth_response(&user))
}

pub async fn logout(State(state): State<AppState>) -> Result<HeaderMap, ApiError> {
    let mut headers = HeaderMap::new();
    let secure_attribute = if state.config.cookie_secure {
        "; Secure"
    } else {
        ""
    };
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0{secure_attribute}"
        ))
        .map_err(|_| ApiError::Internal)?,
    );
    Ok(headers)
}

pub async fn rotate_api_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<Json<ApiKeyResponse>, ApiError> {
    let key = new_api_key();
    let prefix = key.chars().take(12).collect::<String>();
    users::set_api_key(&state.pool, &user.id, &hash_api_key(&key), &prefix).await?;
    Ok(Json(ApiKeyResponse {
        api_key: key,
        prefix,
    }))
}
