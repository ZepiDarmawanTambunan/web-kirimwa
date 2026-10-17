mod config;
mod dto;
mod error;
mod extractors;
mod handlers;
mod middleware;
mod models;
mod repository;
mod seeds;
mod services;

use axum::{
    middleware as axum_middleware,
    routing::{get, post},
    Router,
};
use config::Config;
use sqlx::mysql::MySqlPoolOptions;
use std::{net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::MySqlPool,
    pub config: Arc<Config>,
    pub http: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();

    if std::env::args().nth(1).as_deref() == Some("hash-admin-password") {
        let password = rpassword::prompt_password("Admin password (12-72 bytes): ")?;
        if !(12..=72).contains(&password.len()) {
            return Err("Admin password must contain 12 to 72 bytes".into());
        }
        println!("{}", bcrypt::hash(password, bcrypt::DEFAULT_COST)?);
        return Ok(());
    }

    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "wa_gateway_api=info,tower_http=info".into()),
        )
        .init();

    let config = Arc::new(Config::from_env()?);
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    seeds::seed_admin(&pool, &config).await?;

    let state = AppState {
        pool,
        config: config.clone(),
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()?,
    };

    let protected_session = Router::new()
        .route("/auth/me", get(handlers::auth::me))
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/api-key", post(handlers::auth::rotate_api_key))
        .route("/admin/users", get(handlers::admin::list_users))
        .route(
            "/devices",
            get(handlers::devices::list_devices).post(handlers::devices::register_device),
        )
        .route(
            "/devices/{id}",
            axum::routing::delete(handlers::devices::delete_device),
        )
        .route(
            "/devices/{id}/connect",
            post(handlers::devices::connect_device),
        )
        .route(
            "/devices/{id}/status",
            get(handlers::devices::device_status),
        )
        .route(
            "/devices/{id}/reconnect",
            post(handlers::devices::relink_device),
        )
        .route(
            "/admin/users/{id}",
            axum::routing::patch(handlers::admin::set_user_status),
        )
        .route_layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::session_auth,
        ));

    let protected_messages = Router::new()
        .route(
            "/messages",
            get(handlers::messages::list).post(handlers::messages::send),
        )
        .route("/messages/{id}", get(handlers::messages::get_one))
        .route_layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::message_auth,
        ));

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/v1/auth/register", post(handlers::auth::register))
        .route("/api/v1/auth/login", post(handlers::auth::login))
        .route(
            "/api/v1/webhooks/gateway/{secret}",
            post(handlers::webhooks::gateway_status),
        )
        .nest("/api/v1", protected_session.merge(protected_messages))
        .layer(
            CorsLayer::new()
                .allow_origin(config.web_origin.parse::<http::HeaderValue>()?)
                .allow_credentials(true)
                .allow_methods([
                    http::Method::GET,
                    http::Method::POST,
                    http::Method::PATCH,
                    http::Method::DELETE,
                    http::Method::OPTIONS,
                ])
                .allow_headers([
                    http::header::CONTENT_TYPE,
                    http::header::AUTHORIZATION,
                ]),
        )
        .layer(TraceLayer::new_for_http().make_span_with(|request: &http::Request<_>| {
            tracing::info_span!("http_request", method = %request.method())
        }))
        .with_state(state);

    let address: SocketAddr = config.bind_address.parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!(%address, "API listening");
    axum::serve(listener, app).await?;
    Ok(())
}
