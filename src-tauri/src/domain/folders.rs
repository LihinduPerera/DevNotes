use crate::domain::index::{folder_depth, folder_subtree, path_map, reindex_notes_in_folder_subtree, would_create_cycle};
use crate::domain::util::{new_id, now_iso};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashMap;

pub const MAX_FOLDER_DEPTH: i64 = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSummary {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub note_count: i64,
    pub path: String,
}

fn clean_name(raw: &str) -> AppResult<String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::validation("Folder name cannot be empty"));
    }
    if name.chars().count() > 120 {
        return Err(AppError::validation("Folder name is too long (max 120)"));
    }
    if name.chars().any(|c| c.is_control()) {
        return Err(AppError::validation(
            "Folder name cannot contain control characters",
        ));
    }
    Ok(name.to_string())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<FolderSummary>> {
    let rows: Vec<(String, String, Option<String>, i64, i64)> = sqlx::query_as(
        "SELECT f.id, f.name, f.parent_id, f.sort_order,
                (SELECT count(*) FROM notes n
                  WHERE n.folder_id = f.id AND n.deleted_at IS NULL) AS direct_count
         FROM folders f
         WHERE f.deleted_at IS NULL
         ORDER BY f.sort_order, lower(f.name)",
    )
    .fetch_all(pool)
    .await?;

    let mut conn = pool.acquire().await?;
    let paths: HashMap<String, String> = path_map(&mut conn).await?.into_iter().collect();
    drop(conn);

    let mut counts: HashMap<String, i64> = HashMap::new();
    for (id, _, _, _, direct) in &rows {
        counts.insert(id.clone(), *direct);
    }

    // Propagate counts upward so a collapsed parent shows the subtree total.
    let mut children: HashMap<String, Vec<String>> = HashMap::new();
    for (id, _, parent, _, _) in &rows {
        if let Some(parent) = parent {
            children.entry(parent.clone()).or_default().push(id.clone());
        }
    }
    let mut ordered = rows.clone();
    ordered.sort_by_key(|(_, _, parent, _, _)| parent.is_some());
    for (id, _, parent, _, _) in &rows {
        if parent.is_none() {
            propagate(id, &children, &mut counts);
        }
    }

    Ok(rows
        .into_iter()
        .map(|(id, name, parent_id, sort_order, _)| FolderSummary {
            path: paths.get(&id).cloned().unwrap_or_else(|| name.clone()),
            note_count: counts.get(&id).copied().unwrap_or(0),
            id,
            name,
            parent_id,
            sort_order,
        })
        .collect())
}

fn propagate(id: &str, children: &HashMap<String, Vec<String>>, counts: &mut HashMap<String, i64>) -> i64 {
    let mut total = counts.get(id).copied().unwrap_or(0);
    if let Some(kids) = children.get(id) {
        for kid in kids {
            total += propagate(kid, children, counts);
        }
    }
    counts.insert(id.to_string(), total);
    total
}

pub async fn create(pool: &SqlitePool, name: &str, parent_id: Option<&str>) -> AppResult<FolderSummary> {
    let name = clean_name(name)?;
    let mut tx = pool.begin().await?;

    if let Some(parent) = parent_id {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(parent)
        .fetch_optional(&mut *tx)
        .await?;
        if exists.is_none() {
            return Err(AppError::NotFound {
                entity: "folder",
                id: parent.to_string(),
            });
        }
        if folder_depth(&mut tx, parent).await? >= MAX_FOLDER_DEPTH {
            return Err(AppError::validation(format!(
                "Folders can be nested at most {MAX_FOLDER_DEPTH} levels deep"
            )));
        }
    }

    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM folders
         WHERE deleted_at IS NULL AND name = ?1
           AND ((parent_id IS NULL AND ?2 IS NULL) OR parent_id = ?2)",
    )
    .bind(&name)
    .bind(parent_id)
    .fetch_optional(&mut *tx)
    .await?;
    if duplicate.is_some() {
        return Err(AppError::conflict(format!(
            "A folder named \"{name}\" already exists here"
        )));
    }

    let id = new_id();
    let now = now_iso();
    let sort_order: i64 = sqlx::query_scalar(
        "SELECT COALESCE(max(sort_order), -1) + 1 FROM folders
         WHERE deleted_at IS NULL AND ((parent_id IS NULL AND ?1 IS NULL) OR parent_id = ?1)",
    )
    .bind(parent_id)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO folders (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
    )
    .bind(&id)
    .bind(&name)
    .bind(parent_id)
    .bind(sort_order)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let path = crate::domain::index::folder_path(pool, Some(&id)).await?;
    Ok(FolderSummary {
        path,
        id,
        name,
        parent_id: parent_id.map(str::to_string),
        sort_order,
        note_count: 0,
    })
}

pub async fn rename(pool: &SqlitePool, id: &str, name: &str) -> AppResult<()> {
    let name = clean_name(name)?;
    let mut tx = pool.begin().await?;
    let parent: Option<Option<String>> =
        sqlx::query_scalar("SELECT parent_id FROM folders WHERE id = ?1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    let Some(parent) = parent else {
        return Err(AppError::NotFound {
            entity: "folder",
            id: id.to_string(),
        });
    };

    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM folders
         WHERE deleted_at IS NULL AND id <> ?1 AND name = ?2
           AND ((parent_id IS NULL AND ?3 IS NULL) OR parent_id = ?3)",
    )
    .bind(id)
    .bind(&name)
    .bind(parent.as_deref())
    .fetch_optional(&mut *tx)
    .await?;
    if duplicate.is_some() {
        return Err(AppError::conflict(format!(
            "A folder named \"{name}\" already exists here"
        )));
    }

    sqlx::query("UPDATE folders SET name = ?2, updated_at = ?3 WHERE id = ?1")
        .bind(id)
        .bind(&name)
        .bind(now_iso())
        .execute(&mut *tx)
        .await?;
    reindex_notes_in_folder_subtree(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn move_folder(
    pool: &SqlitePool,
    id: &str,
    parent_id: Option<&str>,
    sort_order: i64,
) -> AppResult<()> {
    let mut tx = pool.begin().await?;

    let current: Option<Option<String>> =
        sqlx::query_scalar("SELECT parent_id FROM folders WHERE id = ?1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    if current.is_none() {
        return Err(AppError::NotFound {
            entity: "folder",
            id: id.to_string(),
        });
    }

    if let Some(parent) = parent_id {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(parent)
        .fetch_optional(&mut *tx)
        .await?;
        if exists.is_none() {
            return Err(AppError::NotFound {
                entity: "folder",
                id: parent.to_string(),
            });
        }
        if would_create_cycle(&mut tx, id, Some(parent)).await? {
            return Err(AppError::validation(
                "A folder cannot be moved inside itself or one of its children",
            ));
        }
        let subtree: Vec<(String, i64)> = folder_subtree(&mut tx, id).await?;
        let deepest = subtree.iter().map(|(_, depth)| *depth).max().unwrap_or(0);
        let parent_depth = folder_depth(&mut tx, parent).await?;
        if parent_depth + deepest + 1 > MAX_FOLDER_DEPTH {
            return Err(AppError::validation(format!(
                "Folders can be nested at most {MAX_FOLDER_DEPTH} levels deep"
            )));
        }
    }

    let name: String = sqlx::query_scalar("SELECT name FROM folders WHERE id = ?1")
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM folders
         WHERE deleted_at IS NULL AND id <> ?1 AND name = ?2
           AND ((parent_id IS NULL AND ?3 IS NULL) OR parent_id = ?3)",
    )
    .bind(id)
    .bind(&name)
    .bind(parent_id)
    .fetch_optional(&mut *tx)
    .await?;
    if duplicate.is_some() {
        return Err(AppError::conflict(format!(
            "A folder named \"{name}\" already exists in the destination"
        )));
    }

    sqlx::query(
        "UPDATE folders SET parent_id = ?2, sort_order = ?3, updated_at = ?4 WHERE id = ?1",
    )
    .bind(id)
    .bind(parent_id)
    .bind(sort_order)
    .bind(now_iso())
    .execute(&mut *tx)
    .await?;

    reindex_notes_in_folder_subtree(&mut tx, id).await?;
    tx.commit().await?;
    Ok(())
}

/// Refuses to delete a folder that still holds notes or subfolders. Losing a
/// whole subtree should always require an explicit, visible action.
pub async fn delete_folder(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM folders WHERE id = ?1 AND deleted_at IS NULL")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound {
            entity: "folder",
            id: id.to_string(),
        });
    }

    let subtree: Vec<(String, i64)> = folder_subtree(&mut tx, id).await?;
    let mut notes = 0i64;
    let mut folders = 0i64;
    for (folder_id, _) in &subtree {
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM notes WHERE folder_id = ?1 AND deleted_at IS NULL",
        )
        .bind(folder_id)
        .fetch_one(&mut *tx)
        .await?;
        notes += count;
        folders += 1;
    }

    if notes > 0 {
        return Err(AppError::conflict(format!(
            "This folder still contains {notes} note(s). Move or delete them first."
        )));
    }
    if folders > 1 {
        return Err(AppError::conflict(
            "This folder still contains subfolders. Delete them first.",
        ));
    }

    sqlx::query("DELETE FROM folders WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// Used by the note editor's breadcrumb; returns ancestors root-first.
pub async fn ancestors(pool: &SqlitePool, id: &str) -> AppResult<Vec<FolderSummary>> {
    let rows: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(
        "WITH RECURSIVE chain(id, name, parent_id, depth) AS (
            SELECT id, name, parent_id, 0 FROM folders WHERE id = ?1
            UNION ALL
            SELECT f.id, f.name, f.parent_id, chain.depth + 1
            FROM folders f JOIN chain ON chain.parent_id = f.id
            WHERE chain.depth < 32
         )
         SELECT id, name, parent_id, depth FROM chain ORDER BY depth DESC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, parent_id, sort_order)| FolderSummary {
            path: String::new(),
            note_count: 0,
            id,
            name,
            parent_id,
            sort_order,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn sibling_names_are_unique_but_cousins_can_share() {
        let pool = test_pool().await;
        let a = create(&pool, "Design", None).await.unwrap();
        assert!(create(&pool, "Design", None).await.is_err());
        let child = create(&pool, "Design", Some(&a.id)).await.unwrap();
        assert_eq!(child.path, "Design / Design");
    }

    #[tokio::test]
    async fn folders_cannot_be_moved_into_their_own_subtree() {
        let pool = test_pool().await;
        let a = create(&pool, "A", None).await.unwrap();
        let b = create(&pool, "B", Some(&a.id)).await.unwrap();
        let error = move_folder(&pool, &a.id, Some(&b.id), 0).await.unwrap_err();
        assert!(matches!(error, AppError::Validation(_)));
    }
}
