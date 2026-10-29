use crate::domain::util::{build_match_query, parse_tags, TagRef};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

/// Snippet highlight markers are control characters (char(1)/char(2)) so
/// nothing user-typed can collide with them; the UI renders them as ranges.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub snippet: String,
    pub folder_id: Option<String>,
    pub folder_path: String,
    pub is_favorite: bool,
    pub updated_at: String,
    pub tags: Vec<TagRef>,
}

#[derive(Debug, FromRow)]
struct SearchRow {
    id: String,
    title: String,
    excerpt: String,
    snippet: String,
    folder_id: Option<String>,
    folder: String,
    is_favorite: i64,
    updated_at: String,
    tags_json: String,
}

pub async fn search(pool: &SqlitePool, query: &str, limit: Option<i64>) -> AppResult<Vec<SearchHit>> {
    let Some(match_query) = build_match_query(query) else {
        return Ok(Vec::new());
    };
    let limit = limit.unwrap_or(40).clamp(1, 200);

    let rows: Vec<SearchRow> = sqlx::query_as(
        "SELECT n.id, n.title, n.excerpt,
                snippet(notes_fts, 2, char(1), char(2), '…', 18) AS snippet,
                n.folder_id, notes_fts.folder,
                n.is_favorite, n.updated_at,
                COALESCE((
                  SELECT json_group_array(json_object('id', t.id, 'name', t.name))
                  FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                  WHERE nt.note_id = n.id
                ), '[]') AS tags_json
           FROM notes_fts
           JOIN notes n ON n.id = notes_fts.note_id
          WHERE notes_fts MATCH ?1 AND n.deleted_at IS NULL
          ORDER BY bm25(notes_fts), n.updated_at DESC
          LIMIT ?2",
    )
    .bind(&match_query)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| {
        log::warn!("search query failed: {error}");
        AppError::internal("Search could not be completed")
    })?;

    Ok(rows
        .into_iter()
        .map(|row| SearchHit {
            id: row.id,
            title: row.title,
            excerpt: row.excerpt,
            snippet: row.snippet,
            folder_id: row.folder_id,
            folder_path: row.folder,
            is_favorite: row.is_favorite != 0,
            updated_at: row.updated_at,
            tags: parse_tags(Some(row.tags_json)),
        })
        .collect())
}

/// Cheap title-only lookup used by the quick switcher and the note-link picker.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleSuggestion {
    pub id: String,
    pub title: String,
}

pub async fn suggest_titles(pool: &SqlitePool, query: &str, limit: i64) -> AppResult<Vec<(String, String)>> {
    let term = format!("%{}%", query.trim().replace('%', "\\%").replace('_', "\\_"));
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, title FROM notes
          WHERE deleted_at IS NULL AND title LIKE ?1 ESCAPE '\\'
          ORDER BY length(title), lower(title)
          LIMIT ?2",
    )
    .bind(term)
    .bind(limit.clamp(1, 50))
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::domain::notes;
    use crate::domain::util::empty_doc;

    #[tokio::test]
    async fn finds_notes_by_body_text_and_ignores_trash() {
        let pool = test_pool().await;
        let note = notes::create(&pool, None, None).await.unwrap();
        notes::save(
            &pool,
            notes::SaveNoteInput {
                id: note.summary.id.clone(),
                revision: 1,
                title: "Dialogue system".into(),
                doc: serde_json::json!({
                    "type": "doc",
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": "Tales component drives quests and dialogue"}]
                    }]
                }),
            },
        )
        .await
        .unwrap();

        let hits = search(&pool, "tales quest", Some(10)).await.unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains('\u{1}'));

        notes::trash_note(&pool, &note.summary.id).await.unwrap();
        let hits = search(&pool, "tales", Some(10)).await.unwrap();
        assert!(hits.is_empty());
    }

    #[tokio::test]
    async fn hostile_queries_do_not_error() {
        let pool = test_pool().await;
        notes::create(&pool, None, None).await.unwrap();
        for query in ["\"", "*", "AND OR NOT", "((((", "a\"b", "-"] {
            let _ = search(&pool, query, Some(5)).await.unwrap();
        }
        let _ = empty_doc();
    }
}
