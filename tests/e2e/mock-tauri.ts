import type { Page } from "@playwright/test";

/**
 * Installs a small in-memory Tauri IPC double so the real React app can be
 * exercised in Chromium. It mirrors the command surface the UI actually uses;
 * anything else resolves to `null` and therefore fails loudly in the UI.
 */
export async function installMockTauri(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface MockNote {
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
      tags: Array<{ id: string; name: string }>;
      doc: { type: string; content: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
    }

    const now = () => new Date().toISOString();
    const settings = {
      editorWidth: 68,
      autosaveEnabled: true,
      autosaveDelayMs: 600,
      spellcheck: true,
      outlineOpen: false,
      sidebarCollapsed: false,
      confirmDelete: true,
    };

    const store = {
      notes: [] as MockNote[],
      saves: 0,
      sequence: 0,
    };

    function summary(note: MockNote) {
      const { doc: _doc, ...rest } = note;
      void _doc;
      return rest;
    }

    function createNote(): MockNote {
      store.sequence += 1;
      const timestamp = now();
      const note: MockNote = {
        id: `note-${store.sequence}`,
        title: "Untitled note",
        excerpt: "",
        folderId: null,
        folderPath: "",
        isFavorite: false,
        wordCount: 0,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastOpenedAt: timestamp,
        deletedAt: null,
        trashedFromFolderId: null,
        trashedFromFolderPath: null,
        tags: [],
        doc: { type: "doc", content: [{ type: "paragraph" }] },
      };
      store.notes.unshift(note);
      return note;
    }

    function find(id: string): MockNote {
      const note = store.notes.find((candidate) => candidate.id === id);
      if (!note) throw { code: "NOT_FOUND", message: "Note not found" };
      return note;
    }

    const internals = {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        switch (command) {
          case "get_settings":
            return settings;
          case "list_folders":
          case "list_tags":
            return [];
          case "list_templates":
            return [];
          case "get_app_info":
            return {
              version: "0.1.0-test",
              dataDir: "C:/mock",
              dbPath: "C:/mock/unrealnotes.db",
              attachmentsDir: "C:/mock/attachments",
              backupsDir: "C:/mock/backups",
              platform: "windows",
            };
          case "get_index_stats":
            return { indexedNotes: store.notes.length, totalNotes: store.notes.length, activeNotes: store.notes.length, inSync: true };
          case "list_notes": {
            const input = (args?.input ?? {}) as { trashed?: boolean };
            return store.notes
              .filter((note) => (input.trashed ? note.deletedAt !== null : note.deletedAt === null))
              .map(summary);
          }
          case "get_note":
            return find(String(args?.id));
          case "create_note":
            return createNote();
          case "save_note": {
            const input = args?.input as {
              id: string;
              revision: number;
              title: string;
              doc: MockNote["doc"];
            };
            const note = find(input.id);
            if (input.revision !== note.revision) {
              throw { code: "CONFLICT", message: "Revision conflict" };
            }
            note.revision += 1;
            note.title = input.title;
            note.doc = input.doc;
            note.updatedAt = now();
            store.saves += 1;
            (window as unknown as { __mockSaves: number }).__mockSaves = store.saves;
            return {
              id: note.id,
              revision: note.revision,
              updatedAt: note.updatedAt,
              wordCount: note.wordCount,
              excerpt: note.excerpt,
              title: note.title,
            };
          }
          case "note_links":
            return { backlinks: [], outlinks: [] };
          case "search_notes":
          case "suggest_notes":
            return [];
          case "set_note_tags":
            return [];
          case "rebuild_search_index":
            return 0;
          case "touch_note":
          case "rename_note":
          case "set_note_favorite":
          case "move_note":
          case "set_setting":
          case "reset_settings":
          case "open_data_dir":
            return null;
          case "trash_note": {
            const note = find(String(args?.id));
            note.deletedAt = now();
            note.trashedFromFolderId = note.folderId;
            note.trashedFromFolderPath = note.folderPath;
            return null;
          }
          case "restore_note": {
            const note = find(String(args?.id));
            note.deletedAt = null;
            note.folderId = note.trashedFromFolderId;
            note.folderPath = note.trashedFromFolderPath ?? "";
            note.trashedFromFolderId = null;
            note.trashedFromFolderPath = null;
            return null;
          }
          case "purge_note": {
            const id = String(args?.id);
            store.notes = store.notes.filter((note) => note.id !== id);
            return null;
          }
          case "empty_trash": {
            const before = store.notes.length;
            store.notes = store.notes.filter((note) => note.deletedAt === null);
            return before - store.notes.length;
          }          default:
            return null;
        }
      },
      convertFileSrc: (path: string) => path,
      transformCallback: (callback: unknown) => callback,
    };

    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = internals;
  });
}
