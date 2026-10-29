use crate::domain::util::now_iso;
use crate::error::{AppError, AppResult};
use serde_json::{json, Map, Value};
use sqlx::SqlitePool;

pub fn defaults() -> Map<String, Value> {
    let mut map = Map::new();
    map.insert("editorWidth".into(), json!(68));
    map.insert("autosaveEnabled".into(), json!(true));
    map.insert("autosaveDelayMs".into(), json!(800));
    map.insert("spellcheck".into(), json!(true));
    map.insert("outlineOpen".into(), json!(true));
    map.insert("sidebarCollapsed".into(), json!(false));
    map.insert("confirmDelete".into(), json!(true));
    map
}

fn validate(key: &str, value: &Value) -> AppResult<()> {
    let invalid = || AppError::validation(format!("Invalid value for setting \"{key}\""));
    match key {
        "editorWidth" => match value.as_i64() {
            Some(width) if (45..=90).contains(&width) => Ok(()),
            _ => Err(invalid()),
        },
        "autosaveDelayMs" => match value.as_i64() {
            Some(delay) if (300..=10_000).contains(&delay) => Ok(()),
            _ => Err(invalid()),
        },
        "autosaveEnabled" | "spellcheck" | "outlineOpen" | "sidebarCollapsed" | "confirmDelete" => {
            value.is_boolean().then_some(()).ok_or_else(invalid)
        }
        _ => Err(AppError::validation(format!("Unknown setting \"{key}\""))),
    }
}

pub async fn get_all(pool: &SqlitePool) -> AppResult<Map<String, Value>> {
    let mut merged = defaults();
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await?;
    for (key, raw) in rows {
        if let Ok(value) = serde_json::from_str::<Value>(&raw) {
            if merged.contains_key(&key) {
                merged.insert(key, value);
            }
        }
    }
    Ok(merged)
}

pub async fn set(pool: &SqlitePool, key: &str, value: Value) -> AppResult<()> {
    validate(key, &value)?;
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value.to_string())
    .bind(now_iso())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn reset(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM settings").execute(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn settings_merge_defaults_and_reject_bad_types() {
        let pool = test_pool().await;
        set(&pool, "editorWidth", json!(58)).await.unwrap();
        let all = get_all(&pool).await.unwrap();
        assert_eq!(all.get("editorWidth").unwrap(), 58);
        assert_eq!(all.get("autosaveDelayMs").unwrap(), 800);
        assert!(set(&pool, "autosaveEnabled", json!("yes")).await.is_err());
        assert!(set(&pool, "nope", json!(1)).await.is_err());
    }
}
