use crate::{
    dto::{QueuedMessage, SendMessageRequest},
    error::ApiError,
    repository::{devices, messages},
    services::providers,
    AppState,
};
use uuid::Uuid;

fn normalize_target(target: &str) -> Option<String> {
    let digits = target.strip_prefix('+').unwrap_or(target);
    ((8..=16).contains(&digits.len())
        && !digits.starts_with('0')
        && digits.bytes().all(|byte| byte.is_ascii_digit()))
    .then(|| digits.to_string())
}

pub async fn send(
    state: &AppState,
    user_id: &str,
    request: SendMessageRequest,
) -> Result<Vec<QueuedMessage>, ApiError> {
    let device = devices::by_id_for_user(&state.pool, user_id, &request.device_id)
        .await?
        .filter(|device| device.is_active)
        .ok_or(ApiError::NotFound)?;
    if device.provider == "baileys" {
        let session = providers::baileys_session_status(state, &device.id).await?;
        devices::set_status(&state.pool, &device.id, user_id, &session.status).await?;
        if session.status != "connected" {
            return Err(ApiError::BadRequest(
                "Baileys device is not connected. Scan its QR code before sending.".into(),
            ));
        }
    }
    let raw_targets: Vec<&str> = request.target.split(',').map(str::trim).collect();
    if raw_targets.is_empty() || raw_targets.len() > 100 {
        return Err(ApiError::BadRequest(
            "target must contain 1 to 100 international phone numbers".to_string(),
        ));
    }
    let targets: Option<Vec<String>> = raw_targets
        .iter()
        .map(|target| normalize_target(target))
        .collect();
    let Some(targets) = targets else {
        return Err(ApiError::BadRequest(
            "target must contain full international numbers with country codes".to_string(),
        ));
    };
    if request.message.trim().is_empty() || request.message.len() > 4096 {
        return Err(ApiError::BadRequest(
            "message must contain 1 to 4096 bytes".to_string(),
        ));
    }
    let mut queued = Vec::with_capacity(targets.len());
    for target in &targets {
        let id = Uuid::new_v4().to_string();
        queued.push(QueuedMessage {
            id,
            device_id: device.id.clone(),
            target: target.clone(),
            status: "Processing".into(),
        });
    }
    let entries: Vec<(String, String)> = queued
        .iter()
        .map(|message| (message.id.clone(), message.target.clone()))
        .collect();
    messages::insert_many_with_daily_limit(
        &state.pool,
        user_id,
        &device.id,
        &entries,
        &request.message,
        50,
    )
    .await?;
    for message in &mut queued {
        match providers::send(state, &device, &message.target, &request.message).await {
            Ok((provider_id, status)) => {
                messages::set_provider_result(&state.pool, &message.id, Some(&provider_id), status)
                    .await?;
                message.status = status.to_string();
            }
            Err(error) => {
                messages::set_provider_result(&state.pool, &message.id, None, "Failed").await?;
                message.status = "Failed".to_string();
                tracing::warn!(device_id = %device.id, message_id = %message.id, %error, "Provider send failed");
            }
        }
    }
    Ok(queued)
}

#[cfg(test)]
mod tests {
    use super::normalize_target;
    #[test]
    fn accepts_international_phone_numbers() {
        assert_eq!(
            normalize_target("628123456789").as_deref(),
            Some("628123456789")
        );
    }
}
