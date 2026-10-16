use crate::{config::Config, error::ApiError, repository::users};
use sqlx::MySqlPool;
use uuid::Uuid;

pub async fn seed_admin(pool: &MySqlPool, config: &Config) -> Result<(), ApiError> {
    let (Some(email), Some(password_hash)) = (
        config.bootstrap_admin_email.as_deref(),
        config.bootstrap_admin_password_hash.as_deref(),
    ) else {
        if config.app_env == "production" {
            tracing::error!("Production startup requires bootstrap administrator credentials");
            return Err(ApiError::Internal);
        }
        tracing::warn!(
            "Admin bootstrap is disabled; configure a BCrypt hash to seed an administrator"
        );
        return Ok(());
    };
    if let Some(user) = users::by_email(pool, email).await? {
        return if user.role == "admin" {
            Ok(())
        } else {
            Err(ApiError::Conflict)
        };
    }

    match users::create(
        pool,
        &Uuid::new_v4().to_string(),
        email,
        password_hash,
        "admin",
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(ApiError::Conflict) => match users::by_email(pool, email).await? {
            Some(user) if user.role == "admin" => Ok(()),
            _ => Err(ApiError::Conflict),
        },
        Err(error) => Err(error),
    }
}
