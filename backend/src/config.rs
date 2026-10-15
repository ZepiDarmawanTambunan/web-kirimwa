use std::{env, io};

pub struct Config {
    pub database_url: String,
    pub fonnte_token: String,
    pub jwt_secret: Vec<u8>,
    pub webhook_secret: String,
    pub web_origin: String,
    pub bind_address: String,
    pub cookie_secure: bool,
}

impl Config {
    pub fn from_env() -> Result<Self, io::Error> {
        let required = |name: &str| -> Result<String, io::Error> {
            env::var(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidInput, format!("{name} must be set"))
                })
        };
        let jwt_secret = required("JWT_SECRET")?.into_bytes();
        if jwt_secret.len() < 32 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "JWT_SECRET must contain at least 32 bytes",
            ));
        }
        let webhook_secret = required("WEBHOOK_SECRET")?;
        if webhook_secret.len() < 32 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "WEBHOOK_SECRET must contain at least 32 bytes",
            ));
        }
        Ok(Self {
            database_url: required("DATABASE_URL")?,
            fonnte_token: required("FONNTE_TOKEN")?,
            jwt_secret,
            webhook_secret,
            web_origin: required("WEB_ORIGIN")?,
            bind_address: env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:8080".into()),
            cookie_secure: env::var("COOKIE_SECURE").unwrap_or_default() == "true",
        })
    }
}
