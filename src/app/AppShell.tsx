import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { NoteListPanel } from "@/components/notes/NoteListPanel";
import { TabBar } from "@/components/shell/TabBar";
import { WelcomeView } from "@/components/views/WelcomeView";
import { api } from "@/lib/ipc";
import { queryKeys, useCreateNote, useNote } from "@/lib/queries";
import { getSaveState, saveManager } from "@/lib/save-manager";
import { displayTitle, errorMessage, isTypingTarget } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

// The editor (Tiptap/ProseMirror) and the overlay dialogs dominate the bundle.
// Loading them on demand keeps the shell's first paint cheap.
const EditorPane = lazy(() =>
  import("@/components/editor/EditorPane").then((module) => ({
    default: module.EditorPane,
  })),
);
const TrashViewLazy = lazy(() =>
  import("@/components/views/TrashView").then((module) => ({
    default: module.TrashView,
  })),
);
const SearchPalette = lazy(() =>
  import("@/components/palettes/SearchPalette").then((module) => ({
    default: module.SearchPalette,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/palettes/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);
const SettingsDialog = lazy(() =>
  import("@/components/settings/SettingsDialog").then((module) => ({
    default: module.SettingsDialog,
  })),
);

function EditorFallback() {
  return (
    <div className="flex flex-1 items-center justify-center text-ui-sm text-muted-foreground/70">
      Loading the editor…
    </div>
  );
}

export function AppShell() {
  const client = useQueryClient();
  const view = useWorkspace((state) => state.view);
  const tabs = useWorkspace((state) => state.tabs);
  const activeTabId = useWorkspace((state) => state.activeTabId);
  const sidebarCollapsed = useWorkspace((state) => state.sidebarCollapsed);
  const outlineOpen = useWorkspace((state) => state.outlineOpen);
  const openNote = useWorkspace((state) => state.openNote);
  const closeTab = useWorkspace((state) => state.closeTab);
  const toggleSidebar = useWorkspace((state) => state.toggleSidebar);
  const setOutlineOpen = useWorkspace((state) => state.setOutlineOpen);

  const activeNote = useNote(activeTabId);
  const createNote = useCreateNote();

  const [searchOpen, setSearchOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleNewNote = useCallback(
    (templateId: string | null = null) => {
      if (createNote.isPending) return;
      const folderId = view.kind === "folder" ? (view.id ?? null) : null;
      createNote.mutate(
        { folderId, templateId },
        {
          onSuccess: (note) => {
            openNote({ id: note.id, title: note.title });
            toast.success("Note created", {
              description: folderId ? "Created in the current folder." : "Created at the top level.",
            });
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
    },
    [createNote, openNote, view.id, view.kind],
  );

  // Tabs restored from the previous session may point at notes that were
  // deleted while the app was closed. Warm the cache and drop the dead ones.
  const initialTabsRef = useRef(tabs);
  useEffect(() => {
    const ids = initialTabsRef.current.map((tab) => tab.noteId);
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.allSettled(
      ids.map((id) =>
        client.fetchQuery({
          queryKey: queryKeys.note(id),
          queryFn: () => api.getNote(id),
          staleTime: Number.POSITIVE_INFINITY,
        }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const alive = new Set(ids.filter((_, index) => results[index]?.status === "fulfilled"));
      if (alive.size !== ids.length) {
        useWorkspace.getState().pruneTabs(alive);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    const label = activeNote.data ? displayTitle(activeNote.data.title) : "UnrealNotes";
    document.title = activeNote.data ? `${label} — UnrealNotes` : "UnrealNotes";
  }, [activeNote.data]);

  const flushAndReport = useCallback(async () => {
    await saveManager.flush();
    const state = getSaveState();
    if (state.status === "conflict") {
      toast.error("There is a save conflict", {
        description: "Open the note and choose which version to keep.",
      });
      return;
    }
    if (state.status === "error") {
      toast.error(state.error ?? "The note could not be saved");
      return;
    }
    toast.success("Everything is saved", {
      description: "Changes are committed to the local SQLite database.",
    });
  }, []);

  const closeActiveTab = useCallback(() => {
    const id = useWorkspace.getState().activeTabId;
    if (!id) return;
    closeTab(id);
  }, [closeTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        handleNewNote(null);
        return;
      }
      if (key === "k" && !event.shiftKey) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (key === "p" && event.shiftKey) {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (key === "," && !event.shiftKey) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        void flushAndReport();
        return;
      }
      if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        closeActiveTab();
        return;
      }
      if (key === "o" && event.shiftKey) {
        event.preventDefault();
        setOutlineOpen(!useWorkspace.getState().outlineOpen);
        return;
      }
      if (key === "b" && !event.shiftKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeActiveTab, flushAndReport, handleNewNote, setOutlineOpen, toggleSidebar]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      void saveManager.flush();
      if (saveManager.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      void saveManager.flush();
    };
  }, []);

  const inTrash = view.kind === "trash";
  const showEditor = !inTrash && activeTabId !== null;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={sidebarCollapsed}
        onCreateNote={() => handleNewNote(null)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCommands={() => setCommandOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {inTrash ? (
        <Suspense fallback={<EditorFallback />}>
          <TrashViewLazy />
        </Suspense>
      ) : (
        <>
          <NoteListPanel
            onOpenNote={openNote}
            onNewNote={handleNewNote}
            onOpenSearch={() => setSearchOpen(true)}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabBar
              onNewNote={() => handleNewNote(null)}
              onToggleOutline={() => setOutlineOpen(!outlineOpen)}
            />
            {showEditor && activeTabId ? (
              <Suspense fallback={<EditorFallback />}>
                <EditorPane
                  key={activeTabId}
                  noteId={activeTabId}
                  onOpenNote={openNote}
                />
              </Suspense>
            ) : (
              <WelcomeView
                onNewNote={handleNewNote}
                onOpenSearch={() => setSearchOpen(true)}
                onOpenCommands={() => setCommandOpen(true)}
              />
            )}
          </div>
        </>
      )}

      <Suspense fallback={null}>
        {searchOpen ? (
          <SearchPalette
            open
            onOpenChange={setSearchOpen}
            onOpenNote={openNote}
          />
        ) : null}
        {commandOpen ? (
          <CommandPalette
            open
            onOpenChange={setCommandOpen}
            onNewNote={() => handleNewNote(null)}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : null}
        {settingsOpen ? (
          <SettingsDialog open onOpenChange={setSettingsOpen} />
        ) : null}
      </Suspense>
    </div>
  );
}
