use crate::{
    dto::{QueuedMessage, SendMessageRequest},
    error::ApiError,
    repository::messages,
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
    let raw_targets: Vec<&str> = request.target.split(',').map(str::trim).collect();
    if raw_targets.is_empty() || raw_targets.len() > 100 {
        return Err(ApiError::BadRequest(
            "target must contain 1 to 100 international phone numbers",
        ));
    }
    let targets: Option<Vec<String>> = raw_targets
        .iter()
        .map(|target| normalize_target(target))
        .collect();
    let Some(targets) = targets else {
        return Err(ApiError::BadRequest(
            "target must contain full international numbers with country codes",
        ));
    };
    if request.message.trim().is_empty() || request.message.len() > 4096 {
        return Err(ApiError::BadRequest("message must contain 1 to 4096 bytes"));
    }
    let mut queued = Vec::with_capacity(targets.len());
    for target in &targets {
        let id = Uuid::new_v4().to_string();
        queued.push(QueuedMessage {
            id,
            target: target.clone(),
            status: "Processing".into(),
        });
    }
    let entries: Vec<(String, String)> = queued
        .iter()
        .map(|message| (message.id.clone(), message.target.clone()))
        .collect();
    messages::insert_many(&state.pool, user_id, &entries, &request.message).await?;
    // Independent gateway: local Baileys queue, no external call
    tracing::info!(targets = ?targets, "WA gateway queued independently");
    Ok(queued)
}

#[cfg(test)]
mod tests {
    use super::normalize_target;
    #[test]
    fn accepts_international_phone_numbers() {
        assert_eq!(normalize_target("628123456789").as_deref(), Some("628123456789"));
    }
}
