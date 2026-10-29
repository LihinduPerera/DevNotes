import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { api } from "./ipc";
import { journal } from "./journal";
import type { JSONContent, SaveNoteResult } from "./types";
import { errorMessage, isConflict } from "./utils";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export interface SaveState {
  status: SaveStatus;
  noteId: string | null;
  lastSavedAt: number | null;
  error: string | null;
}

export interface SaveContent {
  title: string;
  doc: JSONContent;
}

export interface SaveSession {
  noteId: string;
  revision: number;
  getContent: () => SaveContent | null;
  onSaved?: (result: SaveNoteResult) => void;
  onConflict?: (error: unknown) => void;
  delayMs?: number;
}

const saveStore = createStore<SaveState>(() => ({
  status: "idle",
  noteId: null,
  lastSavedAt: null,
  error: null,
}));

export function useSaveState<T>(selector: (state: SaveState) => T): T {
  return useStore(saveStore, selector);
}

export function getSaveState(): SaveState {
  return saveStore.getState();
}

const MIN_DELAY = 350;
const MAX_WAIT = 6_000;

class SaveManager {
  private session: SaveSession | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private queued = false;
  private dirty = false;

  async open(session: SaveSession): Promise<void> {
    if (this.session?.noteId === session.noteId) {
      // Keep the live callbacks fresh without resetting the revision.
      if (saveStore.getState().status !== "conflict") {
        await this.flush();
      }
      const current = this.session;
      if (current && current.noteId === session.noteId) {
        current.getContent = session.getContent;
        current.onSaved = session.onSaved;
        current.onConflict = session.onConflict;
        current.delayMs = session.delayMs;
      }
      return;
    }
    if (!this.session || saveStore.getState().status !== "conflict") {
      await this.flush();
    }
    this.session = session;
    this.dirty = false;
    this.clearTimers();
    saveStore.setState({
      status: "idle",
      noteId: session.noteId,
      lastSavedAt: null,
      error: null,
    });
  }

  detach(noteId?: string): void {
    if (noteId && this.session?.noteId !== noteId) return;
    this.session = null;
    this.dirty = false;
    this.clearTimers();
  }

  get sessionNoteId(): string | null {
    return this.session?.noteId ?? null;
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  markDirty(delayMs?: number): void {
    const session = this.session;
    if (!session) return;
    this.dirty = true;

    const content = session.getContent();
    if (content) {
      journal.put({
        noteId: session.noteId,
        revision: session.revision,
        title: content.title,
        doc: content.doc,
        savedAt: Date.now(),
      });
    }

    if (saveStore.getState().status !== "conflict") {
      saveStore.setState({ status: "dirty", error: null });
    }

    const delay = Math.max(MIN_DELAY, delayMs ?? session.delayMs ?? 800);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.flush();
    }, delay);
    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => {
        void this.flush();
      }, Math.max(MAX_WAIT, delay + 1_000));
    }
  }

  async flush(): Promise<void> {
    this.clearTimers();
    const session = this.session;
    if (!session) {
      await this.whenIdle();
      return;
    }
    if (this.inFlight) {
      this.queued = true;
      await this.whenIdle();
      if (this.dirty) await this.flush();
      return;
    }
    if (!this.dirty) {
      await this.whenIdle();
      return;
    }

    const content = session.getContent();
    if (!content) return;

    this.dirty = false;
    saveStore.setState({ status: "saving", error: null });

    const write = (async () => {
      try {
        const result = await api.saveNote({
          id: session.noteId,
          revision: session.revision,
          title: content.title,
          doc: content.doc,
        });
        session.revision = result.revision;
        journal.remove(session.noteId);
        saveStore.setState({
          status: "saved",
          lastSavedAt: Date.now(),
          noteId: session.noteId,
          error: null,
        });
        session.onSaved?.(result);
      } catch (error) {
        this.dirty = true;
        const conflict = isConflict(error);
        saveStore.setState({
          status: conflict ? "conflict" : "error",
          error: errorMessage(error),
        });
        if (conflict) session.onConflict?.(error);
      } finally {
        this.inFlight = null;
        if (this.queued) {
          this.queued = false;
          void this.flush();
        }
      }
    })();

    this.inFlight = write;
    await write;
  }

  /**
   * Waits until every queued database write has settled. Tab switches rely on
   * this so a note's content is never replaced while its save is in flight.
   */
  async whenIdle(): Promise<void> {
    while (this.inFlight) {
      try {
        await this.inFlight;
      } catch {
        // Writes never reject, but keep the loop safe if that changes.
      }
    }
  }

  /** Accept a revision discovered out-of-band (list rename, external change). */
  adoptRevision(revision: number): void {
    if (!this.session) return;
    if (revision > this.session.revision) {
      this.session.revision = revision;
    }
  }

  /** Overwrite after a conflict, using the freshest server revision. */
  async overwrite(revision: number): Promise<void> {
    const session = this.session;
    if (!session) return;
    session.revision = revision;
    this.dirty = true;
    await this.flush();
  }

  /** Drop local edits in favour of what is on disk. */
  discardLocal(noteId?: string): void {
    const session = this.session;
    if (!session) return;
    if (noteId && session.noteId !== noteId) return;
    this.dirty = false;
    this.clearTimers();
    journal.remove(session.noteId);
    saveStore.setState({ status: "idle", error: null });
  }

  async retry(): Promise<void> {
    this.dirty = true;
    await this.flush();
  }

  private clearTimers(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }
}

export const saveManager = new SaveManager();

export function saveStatusLabel(status: SaveStatus): string {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "conflict":
      return "Save conflict";
    case "error":
      return "Save failed";
    default:
      return "Up to date";
  }
}
