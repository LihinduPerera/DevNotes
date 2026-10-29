use crate::domain::index::{reindex_note, reindex_tag};
use crate::domain::util::{new_id, normalize_tag_name, now_iso, TagRef};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

pub const MAX_TAGS_PER_NOTE: usize = 24;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub id: String,
    pub name: String,
    pub note_count: i64,
}

fn clean_tag(raw: &str) -> AppResult<String> {
    let name = raw.trim().trim_start_matches('#').trim();
    if name.is_empty() {
        return Err(AppError::validation("Tag name cannot be empty"));
    }
    if name.chars().count() > 60 {
        return Err(AppError::validation("Tag name is too long (max 60)"));
    }
    if name.chars().any(|c| c.is_control()) {
        return Err(AppError::validation(
            "Tag name cannot contain control characters",
        ));
    }
    Ok(name.to_string())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<TagSummary>> {
    let rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT t.id, t.name, count(n.id) AS note_count
           FROM tags t
           LEFT JOIN note_tags nt ON nt.tag_id = t.id
           LEFT JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
          GROUP BY t.id
          ORDER BY lower(t.name)",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, note_count)| TagSummary {
            id,
            name,
            note_count,
        })
        .collect())
}

/// Finds or creates a tag by its normalized name inside an open transaction.
pub async fn ensure_tag(
    conn: &mut SqliteConnection,
    raw: &str,
) -> Result<(String, String), AppError> {
    let name = clean_tag(raw)?;
    let normalized = normalize_tag_name(&name);
    if normalized.is_empty() {
        return Err(AppError::validation("Tag name cannot be empty"));
    }

    let existing: Option<(String, String)> =
        sqlx::query_as("SELECT id, name FROM tags WHERE normalized_name = ?1")
            .bind(&normalized)
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(found) = existing {
        return Ok(found);
    }

    let id = new_id();
    let now = now_iso();
    sqlx::query(
        "INSERT INTO tags (id, name, normalized_name, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&normalized)
    .bind(&now)
    .execute(&mut *conn)
    .await?;
    Ok((id, name))
}

pub async fn set_note_tags(
    pool: &SqlitePool,
    note_id: &str,
    names: &[String],
) -> AppResult<Vec<TagRef>> {
    if names.len() > MAX_TAGS_PER_NOTE {
        return Err(AppError::validation(format!(
            "A note can have at most {MAX_TAGS_PER_NOTE} tags"
        )));
    }

    let mut tx = pool.begin().await?;
    let exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM notes WHERE id = ?1 AND deleted_at IS NULL")
            .bind(note_id)
            .fetch_optional(&mut *tx)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound {
            entity: "note",
            id: note_id.to_string(),
        });
    }

    let mut seen = std::collections::HashSet::new();
    let mut tags: Vec<TagRef> = Vec::new();
    for raw in names {
        let normalized = normalize_tag_name(raw);
        if normalized.is_empty() || !seen.insert(normalized) {
            continue;
        }
        let (id, name) = ensure_tag(&mut tx, raw).await?;
        tags.push(TagRef { id, name });
    }

    sqlx::query("DELETE FROM note_tags WHERE note_id = ?1")
        .bind(note_id)
        .execute(&mut *tx)
        .await?;
    let now = now_iso();
    for tag in &tags {
        sqlx::query(
            "INSERT INTO note_tags (note_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(note_id)
        .bind(&tag.id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    reindex_note(&mut tx, note_id).await?;
    tx.commit().await?;
    Ok(tags)
}

pub async fn rename_tag(pool: &SqlitePool, id: &str, name: &str) -> AppResult<()> {
    let name = clean_tag(name)?;
    let normalized = normalize_tag_name(&name);
    let mut tx = pool.begin().await?;

    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM tags WHERE normalized_name = ?1 AND id <> ?2")
            .bind(&normalized)
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    if existing.is_some() {
        return Err(AppError::conflict(format!(
            "A tag named \"{name}\" already exists"
        )));
    }

    let result = sqlx::query(
        "UPDATE tags SET name = ?2, normalized_name = ?3, updated_at = ?4 WHERE id = ?1",
    )
    .bind(id)
    .bind(&name)
    .bind(&normalized)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "tag",
            id: id.to_string(),
        });
    }

    reindex_tag(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn delete_tag(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let affected: Vec<String> =
        sqlx::query_scalar("SELECT note_id FROM note_tags WHERE tag_id = ?1")
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;
    let result = sqlx::query("DELETE FROM tags WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "tag",
            id: id.to_string(),
        });
    }
    for note_id in affected {
        reindex_note(&mut tx, &note_id).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::domain::notes;

    #[tokio::test]
    async fn tags_are_deduplicated_case_insensitively() {
        let pool = test_pool().await;
        let note = notes::create(&pool, None, None).await.unwrap();
        let tags = set_note_tags(
            &pool,
            &note.summary.id,
            &["UE5".into(), "ue5".into(), "  UE5  ".into(), "C++".into()],
        )
        .await
        .unwrap();
        assert_eq!(tags.len(), 2);
    }

    #[tokio::test]
    async fn renaming_to_an_existing_tag_is_rejected() {
        let pool = test_pool().await;
        let note = notes::create(&pool, None, None).await.unwrap();
        let tags = set_note_tags(&pool, &note.summary.id, &["one".into(), "two".into()])
            .await
            .unwrap();
        let error = rename_tag(&pool, &tags[0].id, "TWO").await.unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
    }
}
