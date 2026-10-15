use crate::{error::ApiError, AppState};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ApiError::Internal)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    if hash.starts_with("$2") {
        return bcrypt::verify(password, hash).unwrap_or(false);
    }
    PasswordHash::new(hash).ok().is_some_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

pub fn hash_api_key(key: &str) -> String {
    hex::encode(Sha256::digest(key.as_bytes()))
}

pub fn issue_jwt(user_id: &str, state: &AppState) -> Result<String, ApiError> {
    let claims = Claims {
        sub: user_id.to_string(),
        exp: (chrono::Utc::now().timestamp() + 86_400) as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&state.config.jwt_secret),
    )
    .map_err(|_| ApiError::Internal)
}

pub fn new_api_key() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    format!("wag_{}", hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use crate::seeds::ADMIN_PASSWORD;

    use super::{hash_api_key, hash_password, new_api_key, verify_password};

    #[test]
    fn password_hash_verifies_only_the_original_password() {
        let hash = hash_password("a-long-password-123").expect("hash password");
        assert!(verify_password("a-long-password-123", &hash));
        assert!(!verify_password("another-long-password", &hash));
    }

    #[test]
    fn bcrypt_password_hash_verifies_only_the_original_password() {
        let hash = bcrypt::hash(ADMIN_PASSWORD, bcrypt::DEFAULT_COST).expect("hash password");
        assert!(verify_password(ADMIN_PASSWORD, &hash));
        assert!(!verify_password("wrong-password", &hash));
    }

    #[test]
    fn api_keys_are_random_and_hashed() {
        let first = new_api_key();
        let second = new_api_key();
        assert_ne!(first, second);
        assert_eq!(first.len(), 68);
        assert_ne!(hash_api_key(&first), first);
    }
}
