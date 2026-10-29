-- UnrealNotes schema 0001
-- Conventions:
--   * ids are UUID strings, stable across renames/moves and future sync
--   * timestamps are ISO-8601 UTC strings with milliseconds
--   * soft deletion is used for notes and attachments only
--   * the FTS5 index is maintained by the application inside write transactions

CREATE TABLE app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'file-text',
  doc         TEXT NOT NULL CHECK (json_valid(doc)),
  doc_schema  INTEGER NOT NULL DEFAULT 1,
  is_builtin  INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_templates_name ON templates (lower(name));

CREATE TABLE folders (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  parent_id  TEXT REFERENCES folders(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (id <> parent_id)
);

CREATE UNIQUE INDEX ux_folders_sibling_name
  ON folders (COALESCE(parent_id, ''), name)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_folders_parent ON folders (parent_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE TABLE notes (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL DEFAULT '',
  doc                     TEXT NOT NULL CHECK (json_valid(doc)),
  doc_text                TEXT NOT NULL DEFAULT '',
  doc_schema              INTEGER NOT NULL DEFAULT 1,
  excerpt                 TEXT NOT NULL DEFAULT '',
  folder_id               TEXT REFERENCES folders(id) ON DELETE SET NULL,
  template_id             TEXT REFERENCES templates(id) ON DELETE SET NULL,
  is_favorite             INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  word_count              INTEGER NOT NULL DEFAULT 0,
  revision                INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  last_opened_at          TEXT,
  deleted_at              TEXT,
  trashed_from_folder_id  TEXT,
  trashed_from_folder_path TEXT
);

CREATE INDEX ix_notes_active_updated ON notes (deleted_at, updated_at DESC);
CREATE INDEX ix_notes_active_created ON notes (deleted_at, created_at DESC);
CREATE INDEX ix_notes_folder ON notes (folder_id, deleted_at, updated_at DESC);
CREATE INDEX ix_notes_favorite ON notes (is_favorite, deleted_at, updated_at DESC);
CREATE INDEX ix_notes_recent ON notes (last_opened_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_notes_trash ON notes (deleted_at DESC) WHERE deleted_at IS NOT NULL;

CREATE TABLE tags (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  normalized_name TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX ux_tags_normalized ON tags (normalized_name);

CREATE TABLE note_tags (
  note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX ix_note_tags_tag ON note_tags (tag_id);

CREATE TABLE note_links (
  source_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id),
  CHECK (source_id <> target_id)
);

CREATE INDEX ix_note_links_target ON note_links (target_id);

CREATE TABLE attachments (
  id            TEXT PRIMARY KEY,
  note_id       TEXT REFERENCES notes(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('image', 'file')),
  created_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE INDEX ix_attachments_note ON attachments (note_id);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL
);

-- Combined full-text index. `body` is the plain-text projection of the
-- structured document; `tags` and `folder` are denormalized for search.
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body,
  tags,
  folder,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
