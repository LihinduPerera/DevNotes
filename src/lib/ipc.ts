import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  AppSettings,
  AttachmentInfo,
  BackupInfo,
  FolderSummary,
  IndexStats,
  ListNotesInput,
  NoteDetail,
  NoteLinks,
  NoteSummary,
  SaveNoteResult,
  SearchHit,
  TagRef,
  TagSummary,
  TemplateSummary,
  TitleSuggestion,
} from "./types";

export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function assetUrl(path: string): string {
  return convertFileSrc(path);
}

export const api = {
  // Notes
  listNotes: (input: ListNotesInput = {}) =>
    invoke<NoteSummary[]>("list_notes", { input }),
  getNote: (id: string) => invoke<NoteDetail>("get_note", { id }),
  createNote: (folderId: string | null, templateId: string | null) =>
    invoke<NoteDetail>("create_note", { folderId, templateId }),
  saveNote: (input: { id: string; revision: number; title: string; doc: unknown }) =>
    invoke<SaveNoteResult>("save_note", { input }),
  renameNote: (id: string, title: string) => invoke<void>("rename_note", { id, title }),
  setNoteFavorite: (id: string, favorite: boolean) =>
    invoke<void>("set_note_favorite", { id, favorite }),
  moveNote: (id: string, folderId: string | null) =>
    invoke<void>("move_note", { id, folderId }),
  touchNote: (id: string) => invoke<void>("touch_note", { id }),
  trashNote: (id: string) => invoke<void>("trash_note", { id }),
  restoreNote: (id: string) => invoke<void>("restore_note", { id }),
  purgeNote: (id: string) => invoke<void>("purge_note", { id }),
  emptyTrash: () => invoke<number>("empty_trash"),
  duplicateNote: (id: string) => invoke<NoteDetail>("duplicate_note", { id }),
  noteLinks: (id: string) => invoke<NoteLinks>("note_links", { id }),

  // Folders
  listFolders: () => invoke<FolderSummary[]>("list_folders"),
  createFolder: (name: string, parentId: string | null) =>
    invoke<FolderSummary>("create_folder", { name, parentId }),
  renameFolder: (id: string, name: string) => invoke<void>("rename_folder", { id, name }),
  moveFolder: (id: string, parentId: string | null, sortOrder = 0) =>
    invoke<void>("move_folder", { id, parentId, sortOrder }),
  deleteFolder: (id: string) => invoke<void>("delete_folder", { id }),
  folderAncestors: (id: string) => invoke<FolderSummary[]>("folder_ancestors", { id }),

  // Tags
  listTags: () => invoke<TagSummary[]>("list_tags"),
  setNoteTags: (noteId: string, names: string[]) =>
    invoke<TagRef[]>("set_note_tags", { noteId, names }),
  renameTag: (id: string, name: string) => invoke<void>("rename_tag", { id, name }),
  deleteTag: (id: string) => invoke<void>("delete_tag", { id }),

  // Search
  searchNotes: (query: string, limit = 40) =>
    invoke<SearchHit[]>("search_notes", { query, limit }),
  suggestNotes: (query: string, limit = 12) =>
    invoke<TitleSuggestion[]>("suggest_notes", { query, limit }),

  // Templates
  listTemplates: () => invoke<TemplateSummary[]>("list_templates"),
  saveNoteAsTemplate: (noteId: string, name: string) =>
    invoke<TemplateSummary>("save_note_as_template", { noteId, name }),
  deleteTemplate: (id: string) => invoke<void>("delete_template", { id }),

  // Settings & app
  getSettings: () => invoke<AppSettings>("get_settings"),
  setSetting: (key: keyof AppSettings, value: unknown) =>
    invoke<void>("set_setting", { key, value }),
  resetSettings: () => invoke<void>("reset_settings"),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  openDataDir: () => invoke<void>("open_data_dir"),
  rebuildSearchIndex: () => invoke<number>("rebuild_search_index"),
  getIndexStats: () => invoke<IndexStats>("get_index_stats"),

  // Backups
  exportBackup: (destination: string) =>
    invoke<BackupInfo>("export_backup", { destination }),
  inspectBackup: (path: string) => invoke<BackupInfo>("inspect_backup", { path }),
  restoreBackup: (source: string) => invoke<BackupInfo>("restore_backup", { source }),

  // Attachments
  listAttachments: (noteId: string) =>
    invoke<AttachmentInfo[]>("list_attachments", { noteId }),
  importAttachment: (noteId: string, sourcePath: string) =>
    invoke<AttachmentInfo>("import_attachment", { noteId, sourcePath }),
  saveAttachment: (
    noteId: string,
    fileName: string,
    mimeType: string | null,
    bytes: number[],
  ) => invoke<AttachmentInfo>("save_attachment", { noteId, fileName, mimeType, bytes }),
  deleteAttachment: (id: string) => invoke<void>("delete_attachment", { id }),
};
