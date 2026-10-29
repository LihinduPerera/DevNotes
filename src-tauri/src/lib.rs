#![allow(clippy::needless_return)]

mod commands;
mod db;
mod domain;
mod error;
mod paths;

use crate::domain::{attachments, index, settings, templates};
use crate::error::AppResult;
use crate::paths::AppPaths;
use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pool: tokio::sync::RwLock<SqlitePool>,
    pub paths: AppPaths,
}

impl AppState {
    fn new(pool: SqlitePool, paths: AppPaths) -> Self {
        Self {
            pool: tokio::sync::RwLock::new(pool),
            paths,
        }
    }

    pub async fn pool(&self) -> SqlitePool {
        self.pool.read().await.clone()
    }
}

async fn bootstrap(paths: &AppPaths) -> AppResult<SqlitePool> {
    let pool = db::open(paths).await?;

    if let Err(error) = db::daily_backup(&pool, paths).await {
        log::warn!("daily backup failed: {error}");
    }

    templates::seed_builtins(&pool).await?;
    let _ = settings::get_all(&pool).await?;

    let stats = index::index_stats(&pool).await?;
    if !stats.in_sync {
        log::info!(
            "search index out of sync ({} indexed, {} active); rebuilding",
            stats.indexed_notes,
            stats.active_notes
        );
        let mut conn = pool.acquire().await?;
        index::rebuild_all(&mut conn).await?;
    }

    attachments::sweep_orphans(&pool, paths).await;
    Ok(pool)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("unrealnotes".to_string()),
                    }),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let paths = AppPaths::resolve(&handle)?;
            let pool = tauri::async_runtime::block_on(bootstrap(&paths))?;
            app.manage(AppState::new(pool, paths));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_notes,
            commands::get_note,
            commands::create_note,
            commands::save_note,
            commands::rename_note,
            commands::set_note_favorite,
            commands::move_note,
            commands::touch_note,
            commands::trash_note,
            commands::restore_note,
            commands::purge_note,
            commands::empty_trash,
            commands::duplicate_note,
            commands::note_links,
            commands::list_folders,
            commands::create_folder,
            commands::rename_folder,
            commands::move_folder,
            commands::delete_folder,
            commands::folder_ancestors,
            commands::list_tags,
            commands::set_note_tags,
            commands::rename_tag,
            commands::delete_tag,
            commands::search_notes,
            commands::suggest_notes,
            commands::list_templates,
            commands::save_note_as_template,
            commands::delete_template,
            commands::get_settings,
            commands::set_setting,
            commands::reset_settings,
            commands::get_app_info,
            commands::open_data_dir,
            commands::rebuild_search_index,
            commands::get_index_stats,
            commands::export_backup,
            commands::inspect_backup,
            commands::restore_backup,
            commands::list_attachments,
            commands::import_attachment,
            commands::save_attachment,
            commands::delete_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running UnrealNotes");
}
