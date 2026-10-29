use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{SqlitePool};
use std::path::Path;
use std::time::Duration;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Opens the application database, applying migrations with a safety backup
/// whenever the embedded schema is newer than the file on disk.
pub async fn open(paths: &AppPaths) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(&paths.db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10))
        .pragma("temp_store", "memory");

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(20))
        .connect_with(options)
        .await?;

    if needs_migration(&pool).await? {
        backup_before_migration(&pool, paths).await;
    }

    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

async fn needs_migration(pool: &SqlitePool) -> AppResult<bool> {
    let applied = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM _sqlx_migrations")
        .fetch_one(pool)
        .await;

    match applied {
        Ok(count) => Ok(count < MIGRATOR.migrations.len() as i64),
        // No migration table yet: fresh database, nothing worth preserving.
        Err(_) => Ok(false),
    }
}

/// `VACUUM INTO` produces a consistent copy even with WAL enabled.
async fn backup_before_migration(pool: &SqlitePool, paths: &AppPaths) {
    let dir = paths.auto_backup_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let name = format!("pre-migration-{}.db", chrono::Utc::now().format("%Y%m%d-%H%M%S"));
    let target = dir.join(name);
    if let Err(error) = vacuum_into(pool, &target).await {
        log::warn!("pre-migration backup failed: {error}");
    }
}

pub async fn vacuum_into(pool: &SqlitePool, target: &Path) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if target.exists() {
        return Err(AppError::conflict(format!(
            "A file already exists at {}",
            target.display()
        )));
    }
    let target = target.to_string_lossy().to_string();
    sqlx::query("VACUUM INTO ?1")
        .bind(target)
        .execute(pool)
        .await?;
    Ok(())
}

/// One automatic snapshot per day, seven kept. Cheap insurance against a bad
/// upgrade or accidental mass deletion.
pub async fn daily_backup(pool: &SqlitePool, paths: &AppPaths) -> AppResult<()> {
    let dir = paths.auto_backup_dir();
    std::fs::create_dir_all(&dir)?;
    let name = format!("notes-{}.db", chrono::Utc::now().format("%Y-%m-%d"));
    let target = dir.join(name);
    if !target.exists() {
        vacuum_into(pool, &target).await?;
    }
    prune_dir(&dir, 7);
    Ok(())
}

pub fn prune_dir(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<_> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "db"))
        .collect();
    if files.len() <= keep {
        return;
    }
    files.sort_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok());
    let remove = files.len() - keep;
    for entry in files.into_iter().take(remove) {
        let _ = std::fs::remove_file(entry.path());
    }
}

#[cfg(test)]
pub async fn test_pool() -> SqlitePool {
    use std::str::FromStr;

    let options = SqliteConnectOptions::from_str("sqlite::memory:")
        .expect("valid sqlite url")
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Memory);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .expect("open test database");
    MIGRATOR.run(&pool).await.expect("run migrations");
    pool
}
