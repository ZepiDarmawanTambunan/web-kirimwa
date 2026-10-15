use crate::{error::ApiError, models::Message};
use sqlx::MySqlPool;

pub async fn insert_many(
    pool: &MySqlPool,
    user_id: &str,
    entries: &[(String, String)],
    body: &str,
) -> Result<(), ApiError> {
    let mut transaction = pool.begin().await?;
    for (id, target) in entries {
        sqlx::query("INSERT INTO messages (id, user_id, target, body, status) VALUES (?, ?, ?, ?, 'Processing')")
            .bind(id)
            .bind(user_id)
            .bind(target)
            .bind(body)
            .execute(&mut *transaction)
            .await?;
    }
    transaction.commit().await?;
    Ok(())
}

pub async fn set_failed(pool: &MySqlPool, ids: &[String]) -> Result<(), ApiError> {
    for id in ids {
        sqlx::query("UPDATE messages SET status = 'Failed' WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn set_submission_unknown(pool: &MySqlPool, ids: &[String]) -> Result<(), ApiError> {
    for id in ids {
        sqlx::query("UPDATE messages SET status = 'SubmissionUnknown' WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

pub async fn set_provider_ids(pool: &MySqlPool, rows: &[(String, String)]) -> Result<(), ApiError> {
    let mut transaction = pool.begin().await?;
    for (local_id, provider_id) in rows {
        sqlx::query("UPDATE messages SET provider_id = ? WHERE id = ?")
            .bind(provider_id)
            .bind(local_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            "UPDATE messages AS m JOIN pending_webhook_status AS p ON p.provider_id = m.provider_id \
             SET m.state_id = COALESCE(p.state_id, m.state_id), m.status = COALESCE(p.status, m.status), \
             m.state = COALESCE(p.state, m.state) WHERE m.id = ?",
        )
        .bind(local_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM pending_webhook_status WHERE provider_id = ?")
            .bind(provider_id)
            .execute(&mut *transaction)
            .await?;
    }
    transaction.commit().await?;
    Ok(())
}

pub async fn update_status(
    pool: &MySqlPool,
    provider_id: &str,
    state_id: Option<&str>,
    status: Option<&str>,
    state: Option<&str>,
) -> Result<bool, ApiError> {
    let result = sqlx::query(
        "UPDATE messages SET state_id = COALESCE(?, state_id), status = COALESCE(?, status), state = COALESCE(?, state) WHERE provider_id = ?",
    )
    .bind(state_id)
    .bind(status)
    .bind(state)
    .bind(provider_id)
    .execute(pool)
    .await?;
    if result.rows_affected() > 0 {
        return Ok(true);
    }
    Ok(
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE provider_id = ?)",
        )
        .bind(provider_id)
        .fetch_one(pool)
        .await?,
    )
}

pub async fn update_state(
    pool: &MySqlPool,
    state_id: &str,
    state: Option<&str>,
) -> Result<bool, ApiError> {
    let result = sqlx::query("UPDATE messages SET state = COALESCE(?, state) WHERE state_id = ?")
        .bind(state)
        .bind(state_id)
        .execute(pool)
        .await?;
    if result.rows_affected() > 0 {
        return Ok(true);
    }
    let message_exists =
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM messages WHERE state_id = ?)")
            .bind(state_id)
            .fetch_one(pool)
            .await?;
    if message_exists {
        return Ok(true);
    }
    let pending = sqlx::query(
        "UPDATE pending_webhook_status SET state = COALESCE(?, state) WHERE state_id = ?",
    )
    .bind(state)
    .bind(state_id)
    .execute(pool)
    .await?;
    if pending.rows_affected() > 0 {
        return Ok(true);
    }
    Ok(sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM pending_webhook_status WHERE state_id = ?)",
    )
    .bind(state_id)
    .fetch_one(pool)
    .await?)
}

pub async fn store_pending_status(
    pool: &MySqlPool,
    provider_id: &str,
    state_id: Option<&str>,
    status: Option<&str>,
    state: Option<&str>,
) -> Result<(), ApiError> {
    sqlx::query(
        "DELETE FROM pending_webhook_status WHERE received_at < CURRENT_TIMESTAMP() - INTERVAL 1 DAY",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO pending_webhook_status (provider_id, state_id, status, state) \
         VALUES (?, ?, ?, ?) AS incoming \
         ON DUPLICATE KEY UPDATE state_id = COALESCE(incoming.state_id, pending_webhook_status.state_id), \
         status = COALESCE(incoming.status, pending_webhook_status.status), \
         state = COALESCE(incoming.state, pending_webhook_status.state), \
         received_at = CURRENT_TIMESTAMP",
    )
    .bind(provider_id)
    .bind(state_id)
    .bind(status)
    .bind(state)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_for_user(
    pool: &MySqlPool,
    user_id: &str,
    limit: u32,
) -> Result<Vec<Message>, ApiError> {
    Ok(sqlx::query_as::<_, Message>(
        "SELECT id, target, body, provider_id, status, state, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await?)
}

pub async fn by_id_for_user(
    pool: &MySqlPool,
    user_id: &str,
    message_id: &str,
) -> Result<Option<Message>, ApiError> {
    Ok(sqlx::query_as::<_, Message>(
        "SELECT id, target, body, provider_id, status, state, created_at FROM messages WHERE user_id = ? AND id = ?",
    )
    .bind(user_id)
    .bind(message_id)
    .fetch_optional(pool)
    .await?)
}


pub async fn count_recent_24h(pool: &MySqlPool, user_id: &str) -> Result<i64, ApiError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM messages WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(count)
}
