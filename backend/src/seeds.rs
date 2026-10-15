use crate::{error::ApiError, repository::users};
use sqlx::MySqlPool;
use uuid::Uuid;

pub const ADMIN_EMAIL: &str = "admin@example.com";
pub const ADMIN_PASSWORD: &str = "Admin123!";

pub async fn seed_admin(pool: &MySqlPool) -> Result<(), ApiError> {
    if let Some(user) = users::by_email(pool, ADMIN_EMAIL).await? {
        return if user.role == "admin" {
            Ok(())
        } else {
            Err(ApiError::Conflict)
        };
    }

    let password_hash =
        bcrypt::hash(ADMIN_PASSWORD, bcrypt::DEFAULT_COST).map_err(|_| ApiError::Internal)?;
    match users::create(
        pool,
        &Uuid::new_v4().to_string(),
        ADMIN_EMAIL,
        &password_hash,
        "admin",
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(ApiError::Conflict) => match users::by_email(pool, ADMIN_EMAIL).await? {
            Some(user) if user.role == "admin" => Ok(()),
            _ => Err(ApiError::Conflict),
        },
        Err(error) => Err(error),
    }
}
