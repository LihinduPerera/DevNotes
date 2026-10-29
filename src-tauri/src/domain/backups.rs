use crate::db::prune_dir;
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub notes: i64,
    pub folders: i64,
    pub tags: i64,
    pub size_bytes: u64,
    pub path: String,
}

async fn open_readonly(path: &Path) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .read_only(true)
        .busy_timeout(Duration::from_secs(10));
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|_| AppError::validation("This file is not a readable SQLite database"))?;
    Ok(pool)
}

/// Validates that a file is a healthy UnrealNotes database before we let the
/// user overwrite anything with it.
pub async fn inspect(path: &Path) -> AppResult<BackupInfo> {
    if !path.exists() {
        return Err(AppError::validation("Backup file does not exist"));
    }
    let size_bytes = std::fs::metadata(path)?.len();
    if size_bytes == 0 {
        return Err(AppError::validation("Backup file is empty"));
    }

    let pool = open_readonly(path).await?;
    let result = async {
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await?;
        if integrity != "ok" {
            return Err(AppError::validation(format!(
                "Backup failed its integrity check: {integrity}"
            )));
        }

        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
                .fetch_all(&pool)
                .await?;
        for required in ["notes", "folders", "tags", "note_tags", "settings", "notes_fts"] {
            if !tables.iter().any(|table| table == required) {
                return Err(AppError::validation(format!(
                    "Backup is missing the \"{required}\" table"
                )));
            }
        }

        let notes: i64 = sqlx::query_scalar("SELECT count(*) FROM notes")
            .fetch_one(&pool)
            .await?;
        let folders: i64 = sqlx::query_scalar("SELECT count(*) FROM folders")
            .fetch_one(&pool)
            .await?;
        let tags: i64 = sqlx::query_scalar("SELECT count(*) FROM tags")
            .fetch_one(&pool)
            .await?;

        Ok(BackupInfo {
            notes,
            folders,
            tags,
            size_bytes,
            path: path.to_string_lossy().to_string(),
        })
    }
    .await;

    pool.close().await;
    result
}

pub async fn export(pool: &SqlitePool, destination: &Path) -> AppResult<BackupInfo> {
    if destination.exists() {
        std::fs::remove_file(destination)?;
    }
    crate::db::vacuum_into(pool, destination).await?;
    match inspect(destination).await {
        Ok(info) => Ok(info),
        Err(error) => {
            let _ = std::fs::remove_file(destination);
            Err(error)
        }
    }
}

/// Replaces the live database with a validated backup. Keeps a safety snapshot
/// first and then restarts, because swapping an open SQLite database in place
/// is not something to do quietly.
pub async fn restore(
    app: &tauri::AppHandle,
    pool: &SqlitePool,
    paths: &AppPaths,
    source: &Path,
) -> AppResult<BackupInfo> {
    let _info = inspect(source).await?;

    let safety_dir = paths.auto_backup_dir();
    std::fs::create_dir_all(&safety_dir)?;
    let safety = safety_dir.join(format!(
        "pre-restore-{}.db",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    crate::db::vacuum_into(pool, &safety).await?;
    prune_dir(&safety_dir, 10);

    pool.clone().close().await;

    let wal = paths.db_path.with_extension("db-wal");
    let shm = paths.db_path.with_extension("db-shm");
    let _ = tokio::fs::remove_file(&wal).await;
    let _ = tokio::fs::remove_file(&shm).await;
    tokio::fs::copy(source, &paths.db_path).await?;

    app.restart();
}
