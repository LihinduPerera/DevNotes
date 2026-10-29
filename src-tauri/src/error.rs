use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Validation(String),

    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },

    #[error("{0}")]
    Conflict(String),

    #[error("{0}")]
    CorruptDocument(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("file error: {0}")]
    Io(#[from] std::io::Error),

    #[error("application error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation(message.into())
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict(message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "VALIDATION",
            Self::NotFound { .. } => "NOT_FOUND",
            Self::Conflict(_) => "CONFLICT",
            Self::CorruptDocument(_) => "CORRUPT_DOCUMENT",
            Self::Database(_) => "DATABASE",
            Self::Migration(_) => "MIGRATION",
            Self::Io(_) => "IO",
            Self::Tauri(_) => "TAURI",
            Self::Json(_) => "JSON",
            Self::Internal(_) => "INTERNAL",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
