# UnrealNotes

A local-first desktop knowledge base for game-development notes. Everything lives in
SQLite on your machine: no accounts, no sync, no network calls.

Built with Tauri 2, React 19, strict TypeScript, Vite, Tailwind, shadcn/ui, Tiptap and
SQLite (FTS5).

## What it does

- **Outline-first editor.** Headings build a live outline; sections fold from the
  editor gutter or from the outline panel. Folding is derived from the document, so it
  can never drift from what is on screen.
- **Lossless autosave.** Debounced writes plus a maximum wait, revision-checked
  (compare-and-swap) saves, and a recovery journal in `localStorage` so a draft survives
  a crash. Conflicts are surfaced, never overwritten silently.
- **Notes organisation.** Folders, tags, favourites, recently opened, tabs, and a
  dedicated trash view with restore and permanent delete.
- **Search.** SQLite FTS5, updated inside the same transaction as every save.
- **Backups.** `VACUUM INTO` exports, re-opened read-only for an integrity check before
  they are listed as valid. A restore validates the file, snapshots the current database
  and restarts the app.
- **Attachments.** Images pasted or dropped into a note are written to the app data
  directory and referenced by path.
- **Themes.** Accessible light and dark themes with a persisted preference.

## Architecture

```
src/
  app/            Shell, providers, error boundary
  components/     Sidebar, note list, tabs, editor, palettes, settings, views
  features/editor Folding/outline logic and the ProseMirror extension
  lib/            Typed IPC client, queries, save manager, journal, theme, utils
  stores/         Zustand workspace state (tabs, view, layout, sort)
src-tauri/
  src/            Commands, database layer, migrations, backups, search
  migrations/     SQL schema and FTS5 triggers
tests/e2e/        Playwright suite plus an in-memory Tauri IPC double
```

Deliberate choices:

- **Typed Rust commands, not the SQL plugin.** The frontend never holds SQL. Every write
  is a transaction that also updates FTS, and note saves use an explicit revision check
  so two windows can never clobber each other.
- **Two state layers.** TanStack Query owns persisted server-ish state (notes, folders,
  tags, settings); Zustand owns workspace UI state (open tabs, active view, layout) and
  is persisted separately.
- **One editor per open note.** `EditorPane` is keyed by note id, and the previous note's
  save session is flushed before the next note's content is swapped in.
- **Code splitting.** The shell paints first; the Tiptap editor and the overlay dialogs
  load on demand.

## Development

Requirements: Node 20+, pnpm, Rust (stable), and the Tauri system dependencies for your
platform.

```bash
pnpm install
pnpm tauri dev
```

Web-only development (Tauri IPC unavailable, so most data flows will not work):

```bash
pnpm dev
```

## Checks

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # vitest (unit)
pnpm exec playwright test   # end-to-end against the real UI with mocked IPC
pnpm build         # production frontend bundle
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build   # desktop installers
```

The end-to-end suite runs the app in Chromium with `tests/e2e/mock-tauri.ts` standing in
for the Tauri IPC bridge, so it exercises the real components without a Rust build.

## Data

The database, attachments, backups and logs live in the platform app-data directory and
are visible from **Settings → Data & backups** (and **About** for the exact paths). Never
move or delete the database while the app is running; use the backup tools instead.
