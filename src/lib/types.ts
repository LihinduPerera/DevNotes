export interface JSONContent {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JSONContent[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TagRef {
  id: string;
  name: string;
}

export interface NoteSummary {
  id: string;
  title: string;
  excerpt: string;
  folderId: string | null;
  folderPath: string;
  isFavorite: boolean;
  wordCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  deletedAt: string | null;
  trashedFromFolderId: string | null;
  trashedFromFolderPath: string | null;
  tags: TagRef[];
}

export interface NoteDetail extends NoteSummary {
  doc: JSONContent;
  docSchema: number;
  templateId: string | null;
}

export interface SaveNoteResult {
  id: string;
  revision: number;
  updatedAt: string;
  wordCount: number;
  excerpt: string;
  title: string;
}

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  noteCount: number;
  path: string;
}

export interface TagSummary {
  id: string;
  name: string;
  noteCount: number;
}

export interface SearchHit {
  id: string;
  title: string;
  excerpt: string;
  snippet: string;
  folderId: string | null;
  folderPath: string;
  isFavorite: boolean;
  updatedAt: string;
  tags: TagRef[];
}

export interface TitleSuggestion {
  id: string;
  title: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  isBuiltin: boolean;
  sortOrder: number;
}

export interface AppSettings {
  editorWidth: number;
  autosaveEnabled: boolean;
  autosaveDelayMs: number;
  spellcheck: boolean;
  outlineOpen: boolean;
  sidebarCollapsed: boolean;
  confirmDelete: boolean;
}

export interface AttachmentInfo {
  id: string;
  noteId: string | null;
  originalName: string;
  storedName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  createdAt: string;
}

export interface BackupInfo {
  notes: number;
  folders: number;
  tags: number;
  sizeBytes: number;
  path: string;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  attachmentsDir: string;
  backupsDir: string;
  platform: string;
}

export interface IndexStats {
  indexedNotes: number;
  totalNotes: number;
  activeNotes: number;
  inSync: boolean;
}

export interface LinkRef {
  id: string;
  title: string;
  folderPath: string;
}

export interface NoteLinks {
  backlinks: LinkRef[];
  outlinks: LinkRef[];
}

export type NoteSort = "updated" | "created" | "title" | "words";

export interface ListNotesInput {
  trashed?: boolean;
  favorite?: boolean;
  recent?: boolean;
  folderId?: string | null;
  includeSubfolders?: boolean;
  tagId?: string | null;
  sort?: NoteSort;
  limit?: number;
  offset?: number;
}

export type ThemeMode = "light" | "dark" | "system";

export interface AppErrorShape {
  code: string;
  message: string;
}
