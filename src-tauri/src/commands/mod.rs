use crate::domain::{
    attachments as attachment_domain, backups, folders, index, notes, search, settings, tags,
    templates,
};
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::AppState;
use serde::Serialize;
use serde_json::Value;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub db_path: String,
    pub attachments_dir: String,
    pub backups_dir: String,
    pub platform: String,
}

async fn remove_attachment_files(paths: &AppPaths, files: Vec<String>) {
    for file in files {
        let _ = tokio::fs::remove_file(paths.attachment_file(&file)).await;
    }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_notes(
    state: State<'_, AppState>,
    input: Option<notes::ListNotesInput>,
) -> AppResult<Vec<notes::NoteSummary>> {
    let pool = state.pool().await;
    notes::list(&pool, &input.unwrap_or_default()).await
}

#[tauri::command]
pub async fn get_note(state: State<'_, AppState>, id: String) -> AppResult<notes::NoteDetail> {
    let pool = state.pool().await;
    notes::get(&pool, &id).await
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, AppState>,
    folder_id: Option<String>,
    template_id: Option<String>,
) -> AppResult<notes::NoteDetail> {
    let pool = state.pool().await;
    notes::create(&pool, folder_id, template_id).await
}

#[tauri::command]
pub async fn save_note(
    state: State<'_, AppState>,
    input: notes::SaveNoteInput,
) -> AppResult<notes::SaveNoteResult> {
    let pool = state.pool().await;
    notes::save(&pool, input).await
}

#[tauri::command]
pub async fn rename_note(state: State<'_, AppState>, id: String, title: String) -> AppResult<()> {
    let pool = state.pool().await;
    notes::rename(&pool, &id, &title).await
}

#[tauri::command]
pub async fn set_note_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> AppResult<()> {
    let pool = state.pool().await;
    notes::set_favorite(&pool, &id, favorite).await
}

#[tauri::command]
pub async fn move_note(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> AppResult<()> {
    let pool = state.pool().await;
    notes::move_to_folder(&pool, &id, folder_id.as_deref()).await
}

#[tauri::command]
pub async fn touch_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    notes::touch(&pool, &id).await
}

#[tauri::command]
pub async fn trash_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    notes::trash_note(&pool, &id).await
}

#[tauri::command]
pub async fn restore_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    notes::restore(&pool, &id).await
}

#[tauri::command]
pub async fn purge_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    let files = notes::purge(&pool, &id).await?;
    remove_attachment_files(&state.paths, files).await;
    Ok(())
}

#[tauri::command]
pub async fn empty_trash(state: State<'_, AppState>) -> AppResult<i64> {
    let pool = state.pool().await;
    let (count, files) = notes::empty_trash(&pool).await?;
    remove_attachment_files(&state.paths, files).await;
    Ok(count)
}

#[tauri::command]
pub async fn duplicate_note(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<notes::NoteDetail> {
    let pool = state.pool().await;
    notes::duplicate(&pool, &id).await
}

#[tauri::command]
pub async fn note_links(state: State<'_, AppState>, id: String) -> AppResult<notes::NoteLinks> {
    let pool = state.pool().await;
    notes::links(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_folders(state: State<'_, AppState>) -> AppResult<Vec<folders::FolderSummary>> {
    let pool = state.pool().await;
    folders::list(&pool).await
}

#[tauri::command]
pub async fn create_folder(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> AppResult<folders::FolderSummary> {
    let pool = state.pool().await;
    folders::create(&pool, &name, parent_id.as_deref()).await
}

#[tauri::command]
pub async fn rename_folder(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<()> {
    let pool = state.pool().await;
    folders::rename(&pool, &id, &name).await
}

#[tauri::command]
pub async fn move_folder(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
    sort_order: Option<i64>,
) -> AppResult<()> {
    let pool = state.pool().await;
    folders::move_folder(&pool, &id, parent_id.as_deref(), sort_order.unwrap_or(0)).await
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    folders::delete_folder(&pool, &id).await
}

#[tauri::command]
pub async fn folder_ancestors(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<folders::FolderSummary>> {
    let pool = state.pool().await;
    folders::ancestors(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<tags::TagSummary>> {
    let pool = state.pool().await;
    tags::list(&pool).await
}

#[tauri::command]
pub async fn set_note_tags(
    state: State<'_, AppState>,
    note_id: String,
    names: Vec<String>,
) -> AppResult<Vec<crate::domain::util::TagRef>> {
    let pool = state.pool().await;
    tags::set_note_tags(&pool, &note_id, &names).await
}

#[tauri::command]
pub async fn rename_tag(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<()> {
    let pool = state.pool().await;
    tags::rename_tag(&pool, &id, &name).await
}

#[tauri::command]
pub async fn delete_tag(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    tags::delete_tag(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn search_notes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> AppResult<Vec<search::SearchHit>> {
    let pool = state.pool().await;
    search::search(&pool, &query, limit).await
}

#[tauri::command]
pub async fn suggest_notes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i64>,
) -> AppResult<Vec<search::TitleSuggestion>> {
    let pool = state.pool().await;
    let rows = search::suggest_titles(&pool, &query, limit.unwrap_or(12)).await?;
    Ok(rows
        .into_iter()
        .map(|(id, title)| search::TitleSuggestion { id, title })
        .collect())
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_templates(
    state: State<'_, AppState>,
) -> AppResult<Vec<templates::TemplateSummary>> {
    let pool = state.pool().await;
    templates::list(&pool).await
}

#[tauri::command]
pub async fn save_note_as_template(
    state: State<'_, AppState>,
    note_id: String,
    name: String,
) -> AppResult<templates::TemplateSummary> {
    let pool = state.pool().await;
    templates::save_from_note(&pool, &note_id, &name).await
}

#[tauri::command]
pub async fn delete_template(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    templates::delete(&pool, &id).await
}

// ---------------------------------------------------------------------------
// Settings & application
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<serde_json::Map<String, Value>> {
    let pool = state.pool().await;
    settings::get_all(&pool).await
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> AppResult<()> {
    let pool = state.pool().await;
    settings::set(&pool, &key, value).await
}

#[tauri::command]
pub async fn reset_settings(state: State<'_, AppState>) -> AppResult<()> {
    let pool = state.pool().await;
    settings::reset(&pool).await
}

#[tauri::command]
pub async fn get_app_info(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: state.paths.data_dir.to_string_lossy().to_string(),
        db_path: state.paths.db_path.to_string_lossy().to_string(),
        attachments_dir: state.paths.attachments_dir.to_string_lossy().to_string(),
        backups_dir: state.paths.backups_dir.to_string_lossy().to_string(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub async fn open_data_dir(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    app.opener()
        .open_path(state.paths.data_dir.to_string_lossy().to_string(), None::<String>)
        .map_err(|error| AppError::internal(error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn rebuild_search_index(state: State<'_, AppState>) -> AppResult<i64> {
    let pool = state.pool().await;
    let mut conn = pool.acquire().await?;
    let count = index::rebuild_all(&mut conn).await?;
    Ok(count as i64)
}

#[tauri::command]
pub async fn get_index_stats(state: State<'_, AppState>) -> AppResult<index::IndexStats> {
    let pool = state.pool().await;
    index::index_stats(&pool).await
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn export_backup(
    state: State<'_, AppState>,
    destination: String,
) -> AppResult<backups::BackupInfo> {
    let pool = state.pool().await;
    backups::export(&pool, std::path::Path::new(&destination)).await
}

#[tauri::command]
pub async fn inspect_backup(state: State<'_, AppState>, path: String) -> AppResult<backups::BackupInfo> {
    let _ = state;
    backups::inspect(std::path::Path::new(&path)).await
}

#[tauri::command]
pub async fn restore_backup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    source: String,
) -> AppResult<backups::BackupInfo> {
    let pool = state.pool().await;
    backups::restore(&app, &pool, &state.paths, std::path::Path::new(&source)).await
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_attachments(
    state: State<'_, AppState>,
    note_id: String,
) -> AppResult<Vec<attachment_domain::Attachment>> {
    let pool = state.pool().await;
    attachment_domain::list(&pool, &state.paths, &note_id).await
}

#[tauri::command]
pub async fn import_attachment(
    state: State<'_, AppState>,
    note_id: String,
    source_path: String,
) -> AppResult<attachment_domain::Attachment> {
    let pool = state.pool().await;
    attachment_domain::import_path(
        &pool,
        &state.paths,
        &note_id,
        std::path::Path::new(&source_path),
    )
    .await
}

#[tauri::command]
pub async fn save_attachment(
    state: State<'_, AppState>,
    note_id: String,
    file_name: String,
    mime_type: Option<String>,
    bytes: Vec<u8>,
) -> AppResult<attachment_domain::Attachment> {
    let pool = state.pool().await;
    attachment_domain::save_bytes(
        &pool,
        &state.paths,
        &note_id,
        &file_name,
        mime_type.as_deref(),
        &bytes,
    )
    .await
}

#[tauri::command]
pub async fn delete_attachment(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let pool = state.pool().await;
    attachment_domain::delete(&pool, &state.paths, &id).await
}
