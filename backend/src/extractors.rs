use crate::error::ApiError;
use axum::extract::{FromRequest, Json, Request};
use serde::de::DeserializeOwned;

pub struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        Json::<T>::from_request(request, state)
            .await
            .map(|Json(value)| Self(value))
            .map_err(|_| ApiError::BadRequest("request body must be valid JSON".to_string()))
    }
}
