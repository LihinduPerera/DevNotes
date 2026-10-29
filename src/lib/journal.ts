import type { JSONContent } from "./types";

export interface JournalEntry {
  noteId: string;
  revision: number;
  title: string;
  doc: JSONContent;
  savedAt: number;
}

const STORAGE_KEY = "unrealnotes.recovery.v1";
const MAX_BYTES = 3 * 1024 * 1024;

type JournalMap = Record<string, JournalEntry>;

function readAll(): JournalMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as JournalMap;
  } catch {
    return {};
  }
}

function writeAll(map: JournalMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    const serialized = JSON.stringify(map);
    if (serialized.length > MAX_BYTES) return;
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Quota errors must never break editing.
  }
}

export const journal = {
  get(noteId: string): JournalEntry | null {
    const entry = readAll()[noteId];
    return entry && entry.noteId === noteId ? entry : null;
  },

  /** Decides whether a journal entry can be offered back to the user. */
  status(
    entry: JournalEntry | null,
    remote: { revision: number; title: string; doc: unknown },
  ): "none" | "stale" | "identical" | "recoverable" {
    if (!entry) return "none";
    if (entry.revision !== remote.revision) return "stale";
    const sameTitle = entry.title === remote.title;
    const sameDoc = JSON.stringify(entry.doc) === JSON.stringify(remote.doc);
    return sameTitle && sameDoc ? "identical" : "recoverable";
  },

  put(entry: JournalEntry): void {
    const map = readAll();
    map[entry.noteId] = entry;
    writeAll(map);
  },

  remove(noteId: string): void {
    const map = readAll();
    if (!(noteId in map)) return;
    delete map[noteId];
    writeAll(map);
  },

  clear(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  },

  count(): number {
    return Object.keys(readAll()).length;
  },
};
