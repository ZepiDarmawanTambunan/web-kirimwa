use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub id: String,
    pub email: String,
    pub role: String,
}

#[derive(Serialize)]
pub struct ApiKeyResponse {
    pub api_key: String,
    pub prefix: String,
}

#[derive(Deserialize)]
pub struct SendMessageRequest {
    pub target: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct SendMessageResponse {
    pub messages: Vec<QueuedMessage>,
}

#[derive(Serialize)]
pub struct QueuedMessage {
    pub id: String,
    pub target: String,
    pub status: String,
}

#[derive(Deserialize)]
pub struct GatewayStatusWebhook {
    pub id: Option<serde_json::Value>,
    pub stateid: Option<serde_json::Value>,
    pub status: Option<String>,
    pub state: Option<String>,
}

#[derive(Serialize)]
pub struct MessageList {
    pub messages: Vec<crate::models::Message>,
}
