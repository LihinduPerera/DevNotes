import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { NoteSort } from "@/lib/types";

export type ViewKind = "all" | "favorites" | "recent" | "trash" | "folder" | "tag";

export interface View {
  kind: ViewKind;
  id?: string;
  name?: string;
}

export interface Tab {
  noteId: string;
  title: string;
}

interface WorkspaceState {
  view: View;
  tabs: Tab[];
  activeTabId: string | null;
  expandedFolders: Record<string, boolean>;
  outlineOpen: boolean;
  sidebarCollapsed: boolean;
  sort: NoteSort;
  setView: (view: View) => void;
  openNote: (note: { id: string; title: string }) => void;
  closeTab: (noteId: string) => string | null;
  setActiveTab: (noteId: string) => void;
  renameTab: (noteId: string, title: string) => void;
  toggleFolder: (id: string) => void;
  setFolderExpanded: (id: string, expanded: boolean) => void;
  setOutlineOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSort: (sort: NoteSort) => void;
  pruneTabs: (existingIds: Set<string>) => void;
}

const MAX_TABS = 20;

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      view: { kind: "all", name: "All notes" },
      tabs: [],
      activeTabId: null,
      expandedFolders: {},
      outlineOpen: true,
      sidebarCollapsed: false,
      sort: "updated",

      setView: (view) => set({ view }),

      openNote: ({ id, title }) => {
        const { tabs } = get();
        const existing = tabs.find((tab) => tab.noteId === id);
        if (existing) {
          set({ activeTabId: id });
          return;
        }
        const next = [...tabs, { noteId: id, title }];
        if (next.length > MAX_TABS) {
          const activeIndex = next.findIndex((tab) => tab.noteId === get().activeTabId);
          const dropIndex = activeIndex > 0 ? 0 : 1;
          next.splice(dropIndex, 1);
        }
        set({ tabs: next, activeTabId: id });
      },

      closeTab: (noteId) => {
        const { tabs, activeTabId } = get();
        const index = tabs.findIndex((tab) => tab.noteId === noteId);
        if (index === -1) return activeTabId;
        const next = tabs.filter((tab) => tab.noteId !== noteId);
        let nextActive = activeTabId;
        if (activeTabId === noteId) {
          const neighbour = next[Math.min(index, next.length - 1)];
          nextActive = neighbour?.noteId ?? null;
        }
        set({ tabs: next, activeTabId: nextActive });
        return nextActive;
      },

      setActiveTab: (noteId) => set({ activeTabId: noteId }),

      renameTab: (noteId, title) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.noteId === noteId ? { ...tab, title } : tab)),
        })),

      toggleFolder: (id) =>
        set((state) => ({
          expandedFolders: {
            ...state.expandedFolders,
            [id]: !state.expandedFolders[id],
          },
        })),

      setFolderExpanded: (id, expanded) =>
        set((state) => ({
          expandedFolders: { ...state.expandedFolders, [id]: expanded },
        })),

      setOutlineOpen: (open) => set({ outlineOpen: open }),

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSort: (sort) => set({ sort }),

      pruneTabs: (existingIds) =>
        set((state) => {
          const tabs = state.tabs.filter((tab) => existingIds.has(tab.noteId));
          const activeTabId =
            state.activeTabId && existingIds.has(state.activeTabId)
              ? state.activeTabId
              : (tabs[0]?.noteId ?? null);
          return { tabs, activeTabId };
        }),
    }),
    {
      name: "unrealnotes.workspace.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        view: state.view,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        expandedFolders: state.expandedFolders,
        outlineOpen: state.outlineOpen,
        sidebarCollapsed: state.sidebarCollapsed,
        sort: state.sort,
      }),
    },
  ),
);
