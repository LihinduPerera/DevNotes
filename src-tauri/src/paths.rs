use crate::error::{AppError, AppResult};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub attachments_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub logs_dir: PathBuf,
}

impl AppPaths {
    pub fn resolve(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app.path().app_local_data_dir()?;
        let db_path = data_dir.join("data").join("unrealnotes.db");
        let attachments_dir = data_dir.join("attachments");
        let backups_dir = data_dir.join("backups");
        let logs_dir = app.path().app_log_dir()?;
        let paths = Self {
            data_dir,
            db_path,
            attachments_dir,
            backups_dir,
            logs_dir,
        };
        paths.ensure()?;
        Ok(paths)
    }

    pub fn ensure(&self) -> AppResult<()> {
        for dir in [
            self.db_path.parent().unwrap_or(&self.data_dir),
            &self.attachments_dir,
            &self.backups_dir,
            &self.logs_dir,
        ] {
            fs::create_dir_all(dir)?;
        }
        Ok(())
    }

    pub fn auto_backup_dir(&self) -> PathBuf {
        self.backups_dir.join("auto")
    }

    pub fn attachments_dir_for(&self, attachment_id: &str) -> PathBuf {
        // Flat storage keeps paths predictable; ids prevent collisions.
        self.attachments_dir.clone().join(attachment_id)
    }

    pub fn attachment_file(&self, stored_name: &str) -> PathBuf {
        self.attachments_dir.join(stored_name)
    }

    pub fn ensure_within_attachments(&self, path: &Path) -> AppResult<()> {
        let canonical_root = self.attachments_dir.canonicalize().map_err(|_| {
            AppError::internal("Attachments directory is unavailable")
        })?;
        let canonical_path = path
            .canonicalize()
            .map_err(|_| AppError::internal("Attachment file is missing"))?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(AppError::validation(
                "Refusing to access a file outside the attachments directory",
            ));
        }
        Ok(())
    }
}
