use crate::{
    dto::{QueuedMessage, SendMessageRequest},
    error::ApiError,
    repository::messages,
    AppState,
};
use serde_json::Value;
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
    let local_ids: Vec<String> = queued.iter().map(|message| message.id.clone()).collect();

    let form = reqwest::multipart::Form::new()
        .text("target", targets.join(","))
        .text("countryCode", "0")
        .text("message", request.message);
    let response = match state
        .http
        .post("https://api.fonnte.com/send")
        .header(
            reqwest::header::AUTHORIZATION,
            state.config.fonnte_token.as_str(),
        )
        .multipart(form)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            messages::set_submission_unknown(&state.pool, &local_ids).await?;
            tracing::error!(error = %error, "Fonnte request failed");
            return Err(ApiError::Upstream);
        }
    };
    let status_code = response.status();
    let payload: Value = match response.json().await {
        Ok(payload) => payload,
        Err(error) => {
            messages::set_submission_unknown(&state.pool, &local_ids).await?;
            tracing::error!(error = %error, "Invalid response from Fonnte");
            return Err(ApiError::Upstream);
        }
    };
    if !status_code.is_success() || payload.get("status").and_then(Value::as_bool) == Some(false) {
        messages::set_failed(&state.pool, &local_ids).await?;
        tracing::warn!(status = %status_code, "Fonnte rejected a message request");
        return Err(ApiError::Upstream);
    }

    if let Some(provider_ids) = payload.get("id").and_then(Value::as_array) {
        let response_targets = payload.get("target").and_then(Value::as_array);
        let mut linked = std::collections::HashSet::new();
        let mut mappings = Vec::new();
        for (index, provider_id) in provider_ids.iter().enumerate() {
            let Some(provider_id) = value_as_string(provider_id) else {
                continue;
            };
            let response_target = response_targets
                .and_then(|targets| targets.get(index))
                .and_then(value_as_string);
            let local_message = response_target
                .as_deref()
                .and_then(|target| {
                    queued.iter().find(|message| {
                        message.target == target && !linked.contains(message.id.as_str())
                    })
                })
                .or_else(|| {
                    queued
                        .get(index)
                        .filter(|message| !linked.contains(message.id.as_str()))
                });
            if let Some(local_message) = local_message {
                linked.insert(local_message.id.as_str());
                mappings.push((local_message.id.clone(), provider_id));
            }
        }
        messages::set_provider_ids(&state.pool, &mappings).await?;
        let unresolved: Vec<String> = local_ids
            .iter()
            .filter(|id| !linked.contains(id.as_str()))
            .cloned()
            .collect();
        if !unresolved.is_empty() {
            messages::set_submission_unknown(&state.pool, &unresolved).await?;
        }
    } else if let Some(provider_id) = payload.get("id").and_then(value_as_string) {
        if let Some(first) = queued.first() {
            messages::set_provider_ids(&state.pool, &[(first.id.clone(), provider_id)]).await?;
        }
    } else {
        messages::set_submission_unknown(&state.pool, &local_ids).await?;
    }
    Ok(queued)
}

fn value_as_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
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
        assert_eq!(
            normalize_target("+14155552671").as_deref(),
            Some("14155552671")
        );
    }

    #[test]
    fn rejects_malformed_phone_numbers() {
        assert!(normalize_target("628123").is_none());
        assert!(normalize_target("62812abc789").is_none());
        assert!(normalize_target("628123456789012345").is_none());
        assert!(normalize_target("08123456789").is_none());
    }
}
