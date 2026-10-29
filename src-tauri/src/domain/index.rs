use crate::error::AppError;
use serde::Serialize;
use sqlx::{Executor, Sqlite, SqliteConnection};

/// Resolves the human-readable path of a folder (root first).
pub async fn folder_path<'e, E>(executor: E, folder_id: Option<&str>) -> Result<String, sqlx::Error>
where
    E: Executor<'e, Database = Sqlite>,
{
    let Some(folder_id) = folder_id else {
        return Ok(String::new());
    };

    let path: Option<String> = sqlx::query_scalar(
        "WITH RECURSIVE chain(id, parent_id, name, depth) AS (
            SELECT id, parent_id, name, 0 FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id, f.parent_id, f.name, chain.depth + 1
            FROM folders f JOIN chain ON chain.parent_id = f.id
            WHERE chain.depth < 32
         )
         SELECT group_concat(name, ' / ')
         FROM (SELECT name FROM chain ORDER BY depth DESC)",
    )
    .bind(folder_id)
    .fetch_optional(executor)
    .await?;

    Ok(path.unwrap_or_default())
}

/// Folder ids and their display paths, used to annotate note lists without
/// paying for one recursive query per row.
pub async fn path_map(conn: &mut SqliteConnection) -> Result<Vec<(String, String)>, sqlx::Error> {
    let rows: Vec<(String, Option<String>, String)> =
        sqlx::query_as("SELECT id, parent_id, name FROM folders WHERE deleted_at IS NULL")
            .fetch_all(&mut *conn)
            .await?;

    let mut names: std::collections::HashMap<String, (Option<String>, String)> =
        std::collections::HashMap::with_capacity(rows.len());
    for (id, parent_id, name) in rows {
        names.insert(id, (parent_id, name));
    }

    let mut out = Vec::with_capacity(names.len());
    for id in names.keys() {
        let mut parts: Vec<&str> = Vec::new();
        let mut cursor = Some(id.clone());
        let mut guard = 0;
        while let Some(current) = cursor {
            if guard > 32 {
                break;
            }
            guard += 1;
            let Some((parent, name)) = names.get(&current) else {
                break;
            };
            parts.push(name);
            cursor = parent.clone();
        }
        parts.reverse();
        out.push((id.clone(), parts.join(" / ")));
    }
    Ok(out)
}

/// Returns the subtree ids of a folder ordered children-first (safe for deletion).
pub async fn folder_subtree(
    conn: &mut SqliteConnection,
    root_id: &str,
) -> Result<Vec<(String, i64)>, sqlx::Error> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "WITH RECURSIVE sub(id, depth) AS (
            SELECT id, 0 FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id, sub.depth + 1
            FROM folders f JOIN sub ON f.parent_id = sub.id
            WHERE sub.depth < 32
         )
         SELECT id, depth FROM sub ORDER BY depth DESC",
    )
    .bind(root_id)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows)
}

pub async fn folder_depth(conn: &mut SqliteConnection, id: &str) -> Result<i64, sqlx::Error> {
    let depth: Option<i64> = sqlx::query_scalar(
        "WITH RECURSIVE up(id, parent_id, depth) AS (
            SELECT id, parent_id, 0 FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id, f.parent_id, up.depth + 1
            FROM folders f JOIN up ON f.id = up.parent_id
            WHERE up.depth < 32
         )
         SELECT max(depth) FROM up",
    )
    .bind(id)
    .fetch_one(&mut *conn)
    .await?;
    Ok(depth.unwrap_or(0))
}

/// True when `candidate_parent` is `folder_id` or one of its descendants.
pub async fn would_create_cycle(
    conn: &mut SqliteConnection,
    folder_id: &str,
    candidate_parent: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let Some(candidate_parent) = candidate_parent else {
        return Ok(false);
    };
    let count: i64 = sqlx::query_scalar(
        "WITH RECURSIVE sub(id) AS (
            SELECT id FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
            WHERE 1
         )
         SELECT count(*) FROM sub WHERE id = ?2",
    )
    .bind(folder_id)
    .bind(candidate_parent)
    .fetch_one(&mut *conn)
    .await?;
    Ok(count > 0)
}

/// Rebuilds the FTS row for a single note. Trashed notes are removed from the
/// index so search never surfaces them.
pub async fn reindex_note(
    conn: &mut SqliteConnection,
    note_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM notes_fts WHERE note_id = ?1")
        .bind(note_id)
        .execute(&mut *conn)
        .await?;

    let row: Option<(String, String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT title, doc_text, folder_id, deleted_at FROM notes WHERE id = ?1",
    )
    .bind(note_id)
    .fetch_optional(&mut *conn)
    .await?;

    let Some((title, body, folder_id, deleted_at)) = row else {
        return Ok(());
    };
    if deleted_at.is_some() {
        return Ok(());
    }

    let tags: Option<String> = sqlx::query_scalar(
        "SELECT group_concat(t.name, ' ')
         FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = ?1",
    )
    .bind(note_id)
    .fetch_one(&mut *conn)
    .await?;

    let folder = folder_path(&mut *conn, folder_id.as_deref()).await?;

    sqlx::query(
        "INSERT INTO notes_fts (note_id, title, body, tags, folder) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(note_id)
    .bind(title)
    .bind(body)
    .bind(tags.unwrap_or_default())
    .bind(folder)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

pub async fn reindex_notes_in_folder_subtree(
    conn: &mut SqliteConnection,
    folder_id: &str,
) -> Result<usize, sqlx::Error> {
    let ids: Vec<String> = sqlx::query_scalar(
        "WITH RECURSIVE sub(id) AS (
            SELECT id FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id FROM folders f JOIN sub ON f.parent_id = sub.id
            WHERE 1
         )
         SELECT n.id FROM notes n WHERE n.folder_id IN (SELECT id FROM sub)",
    )
    .bind(folder_id)
    .fetch_all(&mut *conn)
    .await?;

    for id in &ids {
        reindex_note(&mut *conn, id).await?;
    }
    Ok(ids.len())
}

pub async fn reindex_tag(conn: &mut SqliteConnection, tag_id: &str) -> Result<usize, sqlx::Error> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT note_id FROM note_tags WHERE tag_id = ?1")
        .bind(tag_id)
        .fetch_all(&mut *conn)
        .await?;
    for id in &ids {
        reindex_note(&mut *conn, id).await?;
    }
    Ok(ids.len())
}

pub async fn rebuild_all(conn: &mut SqliteConnection) -> Result<usize, sqlx::Error> {
    sqlx::query("DELETE FROM notes_fts")
        .execute(&mut *conn)
        .await?;
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM notes")
        .fetch_all(&mut *conn)
        .await?;
    for id in &ids {
        reindex_note(&mut *conn, id).await?;
    }
    Ok(ids.len())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub indexed_notes: i64,
    pub total_notes: i64,
    pub active_notes: i64,
    pub in_sync: bool,
}

pub async fn index_stats(pool: &sqlx::SqlitePool) -> Result<IndexStats, AppError> {
    let indexed: i64 = sqlx::query_scalar("SELECT count(*) FROM notes_fts")
        .fetch_one(pool)
        .await?;
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM notes")
        .fetch_one(pool)
        .await?;
    let active: i64 =
        sqlx::query_scalar("SELECT count(*) FROM notes WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await?;
    Ok(IndexStats {
        indexed_notes: indexed,
        total_notes: total,
        active_notes: active,
        in_sync: indexed == active,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::domain::folders;
    use crate::domain::notes;

    #[tokio::test]
    async fn reindexes_folder_paths_when_folders_move() {
        let pool = test_pool().await;
        let root = folders::create(&pool, "Root", None).await.unwrap();
        let child = folders::create(&pool, "Child", Some(&root.id)).await.unwrap();
        let note = notes::create(&pool, Some(child.id.clone()), None).await.unwrap();

        let path: String = sqlx::query_scalar("SELECT folder FROM notes_fts WHERE note_id = ?1")
            .bind(&note.summary.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(path, "Root / Child");

        folders::move_folder(&pool, &child.id, None, 0).await.unwrap();
        let path: String = sqlx::query_scalar("SELECT folder FROM notes_fts WHERE note_id = ?1")
            .bind(&note.summary.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(path, "Child");
    }

    #[tokio::test]
    async fn rebuild_recreates_every_active_row() {
        let pool = test_pool().await;
        notes::create(&pool, None, None).await.unwrap();
        notes::create(&pool, None, None).await.unwrap();
        sqlx::query("DELETE FROM notes_fts")
            .execute(&pool)
            .await
            .unwrap();
        let mut conn = pool.acquire().await.unwrap();
        assert_eq!(rebuild_all(&mut conn).await.unwrap(), 2);
        drop(conn);
        let stats = index_stats(&pool).await.unwrap();
        assert!(stats.in_sync);
    }

    #[tokio::test]
    async fn trashed_notes_leave_the_index() {
        let pool = test_pool().await;
        let note = notes::create(&pool, None, None).await.unwrap();
        notes::trash_note(&pool, &note.summary.id).await.unwrap();
        let indexed: i64 = sqlx::query_scalar("SELECT count(*) FROM notes_fts WHERE note_id = ?1")
            .bind(&note.summary.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(indexed, 0);
    }
}
