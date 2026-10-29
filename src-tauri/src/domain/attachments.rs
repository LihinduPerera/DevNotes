use crate::domain::util::{new_id, now_iso};
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use std::path::Path;

pub const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub note_id: Option<String>,
    pub original_name: String,
    pub stored_name: String,
    pub stored_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub kind: String,
    pub created_at: String,
}

fn mime_for(extension: &str) -> &'static str {
    match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "txt" | "log" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "zip" => "application/zip",
        "uasset" | "umap" => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

fn safe_extension(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            ext.chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .take(12)
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .filter(|ext| !ext.is_empty())
        .map(|ext| format!(".{ext}"))
        .unwrap_or_default()
}

fn safe_original_name(file_name: &str) -> String {
    let base = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("attachment")
        .trim();
    let cleaned: String = base.chars().filter(|c| !c.is_control()).take(200).collect();
    if cleaned.is_empty() {
        "attachment".to_string()
    } else {
        cleaned
    }
}

fn to_attachment(row: (String, Option<String>, String, String, String, i64, String, String), paths: &AppPaths) -> Attachment {
    let (id, note_id, original_name, stored_name, mime_type, size_bytes, kind, created_at) = row;
    let stored_path = paths.attachment_file(&stored_name).to_string_lossy().to_string();
    Attachment {
        id,
        note_id,
        original_name,
        stored_name,
        stored_path,
        mime_type,
        size_bytes,
        kind,
        created_at,
    }
}

const COLUMNS: &str = "id, note_id, original_name, stored_name, mime_type, size_bytes, kind, created_at";

pub async fn save_bytes(
    pool: &SqlitePool,
    paths: &AppPaths,
    note_id: &str,
    file_name: &str,
    mime_type: Option<&str>,
    bytes: &[u8],
) -> AppResult<Attachment> {
    if bytes.is_empty() {
        return Err(AppError::validation("The file is empty"));
    }
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::validation(format!(
            "Attachments are limited to {} MB",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        )));
    }

    let exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM notes WHERE id = ?1 AND deleted_at IS NULL")
            .bind(note_id)
            .fetch_optional(pool)
            .await?;
    if exists.is_none() {
        return Err(AppError::NotFound {
            entity: "note",
            id: note_id.to_string(),
        });
    }

    let original_name = safe_original_name(file_name);
    let extension = safe_extension(&original_name);
    let id = new_id();
    let stored_name = format!("{id}{extension}");
    let mime = mime_type
        .map(str::to_string)
        .unwrap_or_else(|| {
            mime_for(extension.trim_start_matches('.')).to_string()
        });
    let kind = if mime.starts_with("image/") { "image" } else { "file" };

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = format!("{:x}", hasher.finalize());

    let target = paths.attachment_file(&stored_name);
    let temp = target.with_extension("tmp");
    tokio::fs::write(&temp, bytes).await?;
    tokio::fs::rename(&temp, &target).await?;

    let now = now_iso();
    let insert = sqlx::query(
        "INSERT INTO attachments (id, note_id, original_name, stored_name, mime_type,
                                  size_bytes, sha256, kind, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )
    .bind(&id)
    .bind(note_id)
    .bind(&original_name)
    .bind(&stored_name)
    .bind(&mime)
    .bind(bytes.len() as i64)
    .bind(&sha256)
    .bind(kind)
    .bind(&now)
    .execute(pool)
    .await;

    if let Err(error) = insert {
        let _ = tokio::fs::remove_file(&target).await;
        return Err(error.into());
    }

    Ok(Attachment {
        id,
        note_id: Some(note_id.to_string()),
        original_name,
        stored_name,
        stored_path: target.to_string_lossy().to_string(),
        mime_type: mime,
        size_bytes: bytes.len() as i64,
        kind: kind.to_string(),
        created_at: now,
    })
}

pub async fn import_path(
    pool: &SqlitePool,
    paths: &AppPaths,
    note_id: &str,
    source: &Path,
) -> AppResult<Attachment> {
    let metadata = tokio::fs::metadata(source).await?;
    if metadata.len() > MAX_ATTACHMENT_BYTES as u64 {
        return Err(AppError::validation(format!(
            "Attachments are limited to {} MB",
            MAX_ATTACHMENT_BYTES / (1024 * 1024)
        )));
    }
    let bytes = tokio::fs::read(source).await?;
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment");
    save_bytes(pool, paths, note_id, file_name, None, &bytes).await
}

pub async fn list(pool: &SqlitePool, paths: &AppPaths, note_id: &str) -> AppResult<Vec<Attachment>> {
    let rows: Vec<(String, Option<String>, String, String, String, i64, String, String)> =
        sqlx::query_as(&format!(
            "SELECT {COLUMNS} FROM attachments
              WHERE note_id = ?1 AND deleted_at IS NULL
              ORDER BY created_at"
        ))
        .bind(note_id)
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| to_attachment(row, paths))
        .collect())
}

pub async fn delete(pool: &SqlitePool, paths: &AppPaths, id: &str) -> AppResult<()> {
    let stored_name: Option<String> =
        sqlx::query_scalar("SELECT stored_name FROM attachments WHERE id = ?1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    let Some(stored_name) = stored_name else {
        return Err(AppError::NotFound {
            entity: "attachment",
            id: id.to_string(),
        });
    };
    sqlx::query("DELETE FROM attachments WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    let _ = tokio::fs::remove_file(paths.attachment_file(&stored_name)).await;
    Ok(())
}

/// Removes files that have no database row. Runs on startup; safe because
/// attachment rows are written only after the bytes land on disk.
pub async fn sweep_orphans(pool: &SqlitePool, paths: &AppPaths) {
    let Ok(rows) = sqlx::query_scalar::<_, String>("SELECT stored_name FROM attachments")
        .fetch_all(pool)
        .await
    else {
        return;
    };
    let known: std::collections::HashSet<String> = rows.into_iter().collect();
    let mut dir = match tokio::fs::read_dir(&paths.attachments_dir).await {
        Ok(dir) => dir,
        Err(_) => return,
    };
    while let Ok(Some(entry)) = dir.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".tmp") || known.contains(&name) {
            continue;
        }
        let _ = tokio::fs::remove_file(entry.path()).await;
    }
}
