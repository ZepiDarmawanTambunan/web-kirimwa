use std::{env, io};

pub struct Config {
    pub app_env: String,
    pub database_url: String,
    pub gateway_token: String,
    pub gateway_url: String,
    pub device_credentials_key: [u8; 32],
    pub meta_graph_api_version: String,
    pub bootstrap_admin_email: Option<String>,
    pub bootstrap_admin_password_hash: Option<String>,
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
        let gateway_token = required("GATEWAY_TOKEN")?;
        if gateway_token.len() < 32 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "GATEWAY_TOKEN must contain at least 32 characters",
            ));
        }
        let credentials_key = hex::decode(required("DEVICE_CREDENTIALS_KEY")?).map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "DEVICE_CREDENTIALS_KEY must be 64 hexadecimal characters",
            )
        })?;
        let device_credentials_key: [u8; 32] = credentials_key.try_into().map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "DEVICE_CREDENTIALS_KEY must be 64 hexadecimal characters",
            )
        })?;
        let meta_graph_api_version =
            env::var("META_GRAPH_API_VERSION").unwrap_or_else(|_| "v24.0".into());
        if !regex::Regex::new(r"^v[0-9]{1,2}\.[0-9]{1,2}$")
            .expect("static Meta API version regex")
            .is_match(&meta_graph_api_version)
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "META_GRAPH_API_VERSION must have the form vNN.N",
            ));
        }
        let bootstrap_admin_email = env::var("BOOTSTRAP_ADMIN_EMAIL")
            .ok()
            .map(|email| email.trim().to_lowercase())
            .filter(|email| !email.is_empty());
        let bootstrap_admin_password_hash = env::var("BOOTSTRAP_ADMIN_PASSWORD_HASH")
            .ok()
            .map(|hash| hash.trim().to_string())
            .filter(|hash| !hash.is_empty());
        if bootstrap_admin_email.is_some() != bootstrap_admin_password_hash.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD_HASH, or neither",
            ));
        }
        let app_env = required("APP_ENV")?;
        if !matches!(app_env.as_str(), "development" | "test" | "production") {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "APP_ENV must be development, test, or production",
            ));
        }
        if app_env == "production"
            && (bootstrap_admin_email.is_none() || bootstrap_admin_password_hash.is_none())
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Production requires BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD_HASH",
            ));
        }
        if let (Some(email), Some(hash)) = (
            bootstrap_admin_email.as_deref(),
            bootstrap_admin_password_hash.as_deref(),
        ) {
            let valid_email = regex::Regex::new(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")
                .expect("static email regex")
                .is_match(email)
                && email.len() <= 254;
            if !valid_email {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "BOOTSTRAP_ADMIN_EMAIL must be a valid email address",
                ));
            }
            if !regex::Regex::new(r"^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$")
                .expect("static BCrypt hash regex")
                .is_match(hash)
                || bcrypt::verify("kirimwa-bootstrap-hash-validation", hash).is_err()
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "BOOTSTRAP_ADMIN_PASSWORD_HASH must be a valid BCrypt hash",
                ));
            }
        }
        Ok(Self {
            app_env,
            database_url: required("DATABASE_URL")?,
            gateway_token,
            gateway_url: required("BAILEYS_GATEWAY_URL")?,
            device_credentials_key,
            meta_graph_api_version,
            bootstrap_admin_email,
            bootstrap_admin_password_hash,
            jwt_secret,
            webhook_secret,
            web_origin: required("WEB_ORIGIN")?,
            bind_address: required("BIND_ADDRESS")?,
            cookie_secure: env::var("COOKIE_SECURE").unwrap_or_default() == "true",
        })
    }
}
