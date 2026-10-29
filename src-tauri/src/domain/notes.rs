use crate::domain::index::{folder_path, reindex_note};
use crate::domain::util::{
    count_words, doc_to_text, empty_doc, extract_note_links, make_excerpt, new_id, now_iso,
    parse_tags, validate_doc, TagRef,
};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, SqlitePool};

const NOTE_COLUMNS: &str = r#"
    n.id, n.title, n.excerpt, n.folder_id, n.is_favorite, n.word_count, n.revision,
    n.created_at, n.updated_at, n.last_opened_at, n.deleted_at,
    n.trashed_from_folder_id, n.trashed_from_folder_path,
    COALESCE((
      SELECT json_group_array(json_object('id', t.id, 'name', t.name))
      FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = n.id
    ), '[]') AS tags_json
"#;

const NOTE_COLUMNS_WITH_DOC: &str = r#"
    n.id, n.title, n.excerpt, n.folder_id, n.is_favorite, n.word_count, n.revision,
    n.created_at, n.updated_at, n.last_opened_at, n.deleted_at,
    n.trashed_from_folder_id, n.trashed_from_folder_path,
    COALESCE((
      SELECT json_group_array(json_object('id', t.id, 'name', t.name))
      FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
      WHERE nt.note_id = n.id
    ), '[]') AS tags_json,
    n.doc, n.doc_schema, n.template_id
"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub folder_id: Option<String>,
    pub folder_path: String,
    pub is_favorite: bool,
    pub word_count: i64,
    pub revision: i64,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
    pub deleted_at: Option<String>,
    pub trashed_from_folder_id: Option<String>,
    pub trashed_from_folder_path: Option<String>,
    pub tags: Vec<TagRef>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    #[serde(flatten)]
    pub summary: NoteSummary,
    pub doc: Value,
    pub doc_schema: i64,
    pub template_id: Option<String>,
}

#[derive(Debug, FromRow)]
struct NoteRow {
    id: String,
    title: String,
    excerpt: String,
    folder_id: Option<String>,
    is_favorite: i64,
    word_count: i64,
    revision: i64,
    created_at: String,
    updated_at: String,
    last_opened_at: Option<String>,
    deleted_at: Option<String>,
    trashed_from_folder_id: Option<String>,
    trashed_from_folder_path: Option<String>,
    tags_json: String,
    #[sqlx(default)]
    doc: Option<String>,
    #[sqlx(default)]
    doc_schema: Option<i64>,
    #[sqlx(default)]
    template_id: Option<String>,
}

impl NoteRow {
    fn into_summary(self, folder_path: String) -> NoteSummary {
        NoteSummary {
            id: self.id,
            title: self.title,
            excerpt: self.excerpt,
            folder_id: self.folder_id,
            folder_path,
            is_favorite: self.is_favorite != 0,
            word_count: self.word_count,
            revision: self.revision,
            created_at: self.created_at,
            updated_at: self.updated_at,
            last_opened_at: self.last_opened_at,
            deleted_at: self.deleted_at,
            trashed_from_folder_id: self.trashed_from_folder_id,
            trashed_from_folder_path: self.trashed_from_folder_path,
            tags: parse_tags(Some(self.tags_json)),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ListNotesInput {
    pub trashed: bool,
    pub favorite: bool,
    pub recent: bool,
    pub folder_id: Option<String>,
    pub include_subfolders: bool,
    pub tag_id: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

fn order_clause(input: &ListNotesInput) -> &'static str {
    if input.trashed {
        return "n.deleted_at DESC";
    }
    if input.recent {
        return "n.last_opened_at DESC";
    }
    match input.sort.as_deref().unwrap_or("updated") {
        "created" => "n.created_at DESC",
        "title" => "lower(n.title) ASC, n.updated_at DESC",
        "words" => "n.word_count DESC, n.updated_at DESC",
        _ => "n.updated_at DESC",
    }
}

pub async fn list(pool: &SqlitePool, input: &ListNotesInput) -> AppResult<Vec<NoteSummary>> {
    let mut sql = String::from("SELECT ");
    sql.push_str(NOTE_COLUMNS);
    sql.push_str(" FROM notes n WHERE ");

    let mut conditions: Vec<&str> = Vec::new();
    if input.trashed {
        conditions.push("n.deleted_at IS NOT NULL");
    } else {
        conditions.push("n.deleted_at IS NULL");
    }
    if input.favorite {
        conditions.push("n.is_favorite = 1");
    }
    if input.recent {
        conditions.push("n.last_opened_at IS NOT NULL");
    }
    if input.folder_id.is_some() {
        if input.include_subfolders {
            conditions.push(
                "n.folder_id IN (
                    WITH RECURSIVE sub(id) AS (
                        SELECT id FROM folders WHERE id = ?1
                        UNION ALL
                        SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
                        WHERE 1
                    )
                    SELECT id FROM sub
                )",
            );
        } else {
            conditions.push("n.folder_id = ?1");
        }
    }
    if input.tag_id.is_some() {
        conditions.push(
            "EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_id = ?2)",
        );
    }
    sql.push_str(&conditions.join(" AND "));
    sql.push_str(" ORDER BY ");
    sql.push_str(order_clause(input));
    sql.push_str(" LIMIT ?3 OFFSET ?4");

    let limit = input.limit.unwrap_or(200).clamp(1, 500);
    let offset = input.offset.unwrap_or(0).max(0);

    let rows: Vec<NoteRow> = sqlx::query_as(&sql)
        .bind(input.folder_id.as_deref())
        .bind(input.tag_id.as_deref())
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

    let mut conn = pool.acquire().await?;
    let mut paths: std::collections::HashMap<String, String> =
        crate::domain::index::path_map(&mut conn)
            .await?
            .into_iter()
            .collect();
    drop(conn);

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let path = row
            .folder_id
            .as_ref()
            .and_then(|id| paths.remove(id))
            .unwrap_or_default();
        out.push(row.into_summary(path));
    }
    Ok(out)
}

pub async fn get(pool: &SqlitePool, id: &str) -> AppResult<NoteDetail> {
    let row: Option<NoteRow> = sqlx::query_as(&format!(
        "SELECT {NOTE_COLUMNS_WITH_DOC} FROM notes n WHERE n.id = ?1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    };

    let path = folder_path(pool, row.folder_id.as_deref()).await?;
    let doc = row
        .doc
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .unwrap_or_else(empty_doc);
    let doc_schema = row.doc_schema.unwrap_or(1);
    let template_id = row.template_id.clone();
    Ok(NoteDetail {
        summary: row.into_summary(path),
        doc,
        doc_schema,
        template_id,
    })
}

pub async fn create(
    pool: &SqlitePool,
    folder_id: Option<String>,
    template_id: Option<String>,
) -> AppResult<NoteDetail> {
    if let Some(folder) = folder_id.as_deref() {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(folder)
        .fetch_optional(pool)
        .await?;
        if exists.is_none() {
            return Err(AppError::NotFound {
                entity: "folder",
                id: folder.to_string(),
            });
        }
    }

    // A stale template id (deleted template, restored backup) must not fail the
    // create: fall back to a blank note and bind NULL so the FK stays valid.
    let (doc, template_id) = match template_id {
        Some(template) => {
            let raw: Option<String> = sqlx::query_scalar("SELECT doc FROM templates WHERE id = ?1")
                .bind(&template)
                .fetch_optional(pool)
                .await?;
            match raw {
                Some(raw) => (
                    serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| empty_doc()),
                    Some(template),
                ),
                None => (empty_doc(), None),
            }
        }
        None => (empty_doc(), None),
    };

    let doc_text = doc_to_text(&doc);
    let id = new_id();
    let now = now_iso();

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO notes (id, title, doc, doc_text, doc_schema, excerpt, folder_id, template_id,
                            word_count, revision, created_at, updated_at)
         VALUES (?1, '', ?2, ?3, 1, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
    )
    .bind(&id)
    .bind(doc.to_string())
    .bind(&doc_text)
    .bind(make_excerpt(&doc_text, 180))
    .bind(folder_id.as_deref())
    .bind(template_id.as_deref())
    .bind(count_words(&doc_text))
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    reindex_note(&mut tx, &id).await?;
    tx.commit().await?;

    get(pool, &id).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: String,
    pub revision: i64,
    pub title: String,
    pub doc: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteResult {
    pub id: String,
    pub revision: i64,
    pub updated_at: String,
    pub word_count: i64,
    pub excerpt: String,
    pub title: String,
}

pub async fn save(pool: &SqlitePool, input: SaveNoteInput) -> AppResult<SaveNoteResult> {
    validate_doc(&input.doc).map_err(AppError::Validation)?;

    let title = input.title.trim().to_string();
    if title.chars().count() > 200 {
        return Err(AppError::validation("Title is too long (max 200 characters)"));
    }

    let doc_text = doc_to_text(&input.doc);
    let word_count = count_words(&doc_text);
    let excerpt = make_excerpt(&doc_text, 180);
    let now = now_iso();
    let links = extract_note_links(&input.doc);

    let mut tx = pool.begin().await?;
    let result = sqlx::query(
        "UPDATE notes
            SET title = ?2, doc = ?3, doc_text = ?4, excerpt = ?5, word_count = ?6,
                revision = revision + 1, updated_at = ?7
          WHERE id = ?1 AND revision = ?8 AND deleted_at IS NULL",
    )
    .bind(&input.id)
    .bind(&title)
    .bind(input.doc.to_string())
    .bind(&doc_text)
    .bind(&excerpt)
    .bind(word_count)
    .bind(&now)
    .bind(input.revision)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        let current: Option<(i64, Option<String>)> =
            sqlx::query_as("SELECT revision, deleted_at FROM notes WHERE id = ?1")
                .bind(&input.id)
                .fetch_optional(&mut *tx)
                .await?;
        return match current {
            None => Err(AppError::NotFound {
                entity: "note",
                id: input.id,
            }),
            Some((_, Some(_))) => Err(AppError::conflict("This note is in the trash")),
            Some((revision, None)) => Err(AppError::conflict(format!(
                "This note changed elsewhere (now revision {revision}, you have {})",
                input.revision
            ))),
        };
    }

    sqlx::query("DELETE FROM note_links WHERE source_id = ?1")
        .bind(&input.id)
        .execute(&mut *tx)
        .await?;
    for target in &links {
        if target == &input.id {
            continue;
        }
        sqlx::query(
            "INSERT OR IGNORE INTO note_links (source_id, target_id, created_at)
             SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM notes WHERE id = ?2)",
        )
        .bind(&input.id)
        .bind(target)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    reindex_note(&mut tx, &input.id).await?;
    tx.commit().await?;

    Ok(SaveNoteResult {
        id: input.id,
        revision: input.revision + 1,
        updated_at: now,
        word_count,
        excerpt,
        title,
    })
}

pub async fn rename(pool: &SqlitePool, id: &str, title: &str) -> AppResult<()> {
    let title = title.trim();
    if title.chars().count() > 200 {
        return Err(AppError::validation("Title is too long (max 200 characters)"));
    }
    let mut tx = pool.begin().await?;
    let result = sqlx::query(
        "UPDATE notes SET title = ?2, revision = revision + 1, updated_at = ?3
          WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(title)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    }
    reindex_note(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn set_favorite(pool: &SqlitePool, id: &str, favorite: bool) -> AppResult<()> {
    let result = sqlx::query(
        "UPDATE notes SET is_favorite = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(i64::from(favorite))
    .bind(now_iso())
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    }
    Ok(())
}

pub async fn move_to_folder(pool: &SqlitePool, id: &str, folder_id: Option<&str>) -> AppResult<()> {
    if let Some(folder) = folder_id {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(folder)
        .fetch_optional(pool)
        .await?;
        if exists.is_none() {
            return Err(AppError::NotFound {
                entity: "folder",
                id: folder.to_string(),
            });
        }
    }

    let mut tx = pool.begin().await?;
    let result = sqlx::query(
        "UPDATE notes SET folder_id = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(folder_id)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    }
    reindex_note(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn touch(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("UPDATE notes SET last_opened_at = ?2 WHERE id = ?1")
        .bind(id)
        .bind(now_iso())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn trash_note(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let folder_id: Option<Option<String>> =
        sqlx::query_scalar("SELECT folder_id FROM notes WHERE id = ?1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    let Some(folder_id) = folder_id else {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    };

    let path = folder_path(pool, folder_id.as_deref()).await?;
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE notes
            SET deleted_at = ?2, trashed_from_folder_id = folder_id,
                trashed_from_folder_path = ?3, updated_at = ?2
          WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(now_iso())
    .bind(&path)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM notes_fts WHERE note_id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn restore(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT trashed_from_folder_id, deleted_at FROM notes WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((folder_id, deleted_at)) = row else {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    };
    if deleted_at.is_none() {
        return Ok(());
    }

    let folder_still_exists: Option<i64> = match folder_id.as_deref() {
        Some(folder) => {
            sqlx::query_scalar("SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL")
                .bind(folder)
                .fetch_optional(&mut *tx)
                .await?
        }
        None => None,
    };

    sqlx::query(
        "UPDATE notes
            SET deleted_at = NULL,
                folder_id = CASE WHEN ?2 = 1 THEN ?3 ELSE NULL END,
                trashed_from_folder_id = NULL, trashed_from_folder_path = NULL,
                updated_at = ?4
          WHERE id = ?1",
    )
    .bind(id)
    .bind(i64::from(folder_still_exists.is_some()))
    .bind(folder_id.as_deref())
    .bind(now_iso())
    .execute(&mut *tx)
    .await?;
    reindex_note(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

/// Hard-deletes a note. Returns the stored attachment file names so the caller
/// can remove the bytes from disk after the transaction commits.
pub async fn purge(pool: &SqlitePool, id: &str) -> AppResult<Vec<String>> {
    let mut tx = pool.begin().await?;
    let files: Vec<String> =
        sqlx::query_scalar("SELECT stored_name FROM attachments WHERE note_id = ?1")
            .bind(id)
            .fetch_all(&mut *tx)
            .await?;
    let result = sqlx::query("DELETE FROM notes WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound {
            entity: "note",
            id: id.to_string(),
        });
    }
    tx.commit().await?;
    Ok(files)
}

pub async fn empty_trash(pool: &SqlitePool) -> AppResult<(i64, Vec<String>)> {
    let mut tx = pool.begin().await?;
    let files: Vec<String> = sqlx::query_scalar(
        "SELECT a.stored_name FROM attachments a
          JOIN notes n ON n.id = a.note_id
         WHERE n.deleted_at IS NOT NULL",
    )
    .fetch_all(&mut *tx)
    .await?;
    let result = sqlx::query("DELETE FROM notes WHERE deleted_at IS NOT NULL")
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok((result.rows_affected() as i64, files))
}

pub async fn duplicate(pool: &SqlitePool, id: &str) -> AppResult<NoteDetail> {
    let source = get(pool, id).await?;
    let new_id = new_id();
    let now = now_iso();
    let title = if source.summary.title.trim().is_empty() {
        String::new()
    } else {
        format!("{} (copy)", source.summary.title)
    };

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO notes (id, title, doc, doc_text, doc_schema, excerpt, folder_id, template_id,
                            is_favorite, word_count, revision, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, 1, ?10, ?10)",
    )
    .bind(&new_id)
    .bind(&title)
    .bind(source.doc.to_string())
    .bind(doc_to_text(&source.doc))
    .bind(source.doc_schema)
    .bind(&source.summary.excerpt)
    .bind(source.summary.folder_id.as_deref())
    .bind(source.template_id.as_deref())
    .bind(source.summary.word_count)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    for tag in &source.summary.tags {
        sqlx::query(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(&new_id)
        .bind(&tag.id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    reindex_note(&mut tx, &new_id).await?;
    tx.commit().await?;

    get(pool, &new_id).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRef {
    pub id: String,
    pub title: String,
    pub folder_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinks {
    pub backlinks: Vec<LinkRef>,
    pub outlinks: Vec<LinkRef>,
}

pub async fn links(pool: &SqlitePool, id: &str) -> AppResult<NoteLinks> {
    let backlinks: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT n.id, n.title, n.folder_id
           FROM note_links l JOIN notes n ON n.id = l.source_id
          WHERE l.target_id = ?1 AND n.deleted_at IS NULL
          ORDER BY n.updated_at DESC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let outlinks: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT n.id, n.title, n.folder_id
           FROM note_links l JOIN notes n ON n.id = l.target_id
          WHERE l.source_id = ?1 AND n.deleted_at IS NULL
          ORDER BY n.title",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    let mut conn = pool.acquire().await?;
    let mut paths: std::collections::HashMap<String, String> =
        crate::domain::index::path_map(&mut conn)
            .await?
            .into_iter()
            .collect();
    drop(conn);

    let mut map = |rows: Vec<(String, String, Option<String>)>| -> Vec<LinkRef> {
        rows.into_iter()
            .map(|(id, title, folder_id)| LinkRef {
                folder_path: folder_id
                    .as_ref()
                    .and_then(|f| paths.remove(f))
                    .unwrap_or_default(),
                id,
                title,
            })
            .collect()
    };

    Ok(NoteLinks {
        backlinks: map(backlinks),
        outlinks: map(outlinks),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::domain::folders;

    fn doc_with_text(text: &str) -> Value {
        serde_json::json!({
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1, "blockId": "h1"}, "content": [{"type": "text", "text": "Heading"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": text}]}
            ]
        })
    }

    #[tokio::test]
    async fn create_get_and_save_round_trip() {
        let pool = test_pool().await;
        let note = create(&pool, None, None).await.unwrap();
        assert_eq!(note.summary.revision, 1);

        let saved = save(
            &pool,
            SaveNoteInput {
                id: note.summary.id.clone(),
                revision: 1,
                title: "Game mode".into(),
                doc: doc_with_text("Unreal game mode owns the rules"),
            },
        )
        .await
        .unwrap();
        assert_eq!(saved.revision, 2);
        assert!(saved.word_count >= 5);

        let loaded = get(&pool, &note.summary.id).await.unwrap();
        assert_eq!(loaded.summary.title, "Game mode");
        assert!(loaded.summary.excerpt.contains("Unreal game mode"));
    }

    #[tokio::test]
    async fn stale_revision_is_rejected() {
        let pool = test_pool().await;
        let note = create(&pool, None, None).await.unwrap();
        let input = || SaveNoteInput {
            id: note.summary.id.clone(),
            revision: 1,
            title: "A".into(),
            doc: empty_doc(),
        };
        save(&pool, input()).await.unwrap();
        let error = save(&pool, input()).await.unwrap_err();
        assert!(matches!(error, AppError::Conflict(_)));
    }

    #[tokio::test]
    async fn trashing_and_restoring_keeps_the_folder_when_it_exists() {
        let pool = test_pool().await;
        let folder = folders::create(&pool, "Systems", None).await.unwrap();
        let note = create(&pool, Some(folder.id.clone()), None).await.unwrap();
        trash_note(&pool, &note.summary.id).await.unwrap();

        let trashed = get(&pool, &note.summary.id).await.unwrap();
        assert!(trashed.summary.deleted_at.is_some());
        assert_eq!(trashed.summary.trashed_from_folder_path, Some("Systems".into()));

        restore(&pool, &note.summary.id).await.unwrap();
        let restored = get(&pool, &note.summary.id).await.unwrap();
        assert_eq!(restored.summary.folder_id.as_deref(), Some(folder.id.as_str()));
    }

    #[tokio::test]
    async fn note_links_are_rebuilt_on_save() {
        let pool = test_pool().await;
        let target = create(&pool, None, None).await.unwrap();
        let source = create(&pool, None, None).await.unwrap();
        let doc = serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "See other note",
                    "marks": [{"type": "link", "attrs": {"href": format!("note://{}", target.summary.id)}}]
                }]
            }]
        });
        save(
            &pool,
            SaveNoteInput {
                id: source.summary.id.clone(),
                revision: 1,
                title: "Source".into(),
                doc,
            },
        )
        .await
        .unwrap();

        let links = links(&pool, &target.summary.id).await.unwrap();
        assert_eq!(links.backlinks.len(), 1);
        assert_eq!(links.backlinks[0].id, source.summary.id);
    }

    #[tokio::test]
    async fn duplicate_copies_content_and_tags() {
        let pool = test_pool().await;
        let note = create(&pool, None, None).await.unwrap();
        crate::domain::tags::set_note_tags(&pool, &note.summary.id, &["UE5".into()])
            .await
            .unwrap();
        let copy = duplicate(&pool, &note.summary.id).await.unwrap();
        assert_ne!(copy.summary.id, note.summary.id);
        assert_eq!(copy.summary.tags.len(), 1);
    }
}
