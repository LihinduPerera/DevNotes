import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./ipc";
import type {
  AppSettings,
  ListNotesInput,
  NoteDetail,
  SaveNoteResult,
} from "./types";
import type { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  notes: (input: ListNotesInput) => ["notes", input] as const,
  note: (id: string) => ["note", id] as const,
  links: (id: string) => ["note-links", id] as const,
  folders: ["folders"] as const,
  tags: ["tags"] as const,
  templates: ["templates"] as const,
  settings: ["settings"] as const,
  appInfo: ["app-info"] as const,
  indexStats: ["index-stats"] as const,
  attachments: (noteId: string) => ["attachments", noteId] as const,
  search: (query: string) => ["search", query] as const,
};

export function invalidateNoteLists(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ["notes"] });
  void client.invalidateQueries({ queryKey: ["tags"] });
  void client.invalidateQueries({ queryKey: ["folders"] });
  void client.invalidateQueries({ queryKey: ["search"] });
}

export function syncNoteCache(client: QueryClient, result: SaveNoteResult): void {
  client.setQueryData<NoteDetail>(queryKeys.note(result.id), (previous) =>
    previous
      ? {
          ...previous,
          title: result.title,
          revision: result.revision,
          updatedAt: result.updatedAt,
          wordCount: result.wordCount,
          excerpt: result.excerpt,
        }
      : previous,
  );
}

export function useNotes(input: ListNotesInput) {
  return useQuery({
    queryKey: queryKeys.notes(input),
    queryFn: () => api.listNotes(input),
    placeholderData: keepPreviousData,
    staleTime: 4_000,
  });
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: queryKeys.note(id ?? "none"),
    queryFn: () => api.getNote(id as string),
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
    // The note cache is written from outside React (autosave, rename, restore)
    // and read by several components. The default "tracked props" notification
    // optimization can drop those writes, so opt into notifying on every change.
    notifyOnChangeProps: "all",
  });
}

export function useNoteLinks(id: string | null) {
  return useQuery({
    queryKey: queryKeys.links(id ?? "none"),
    queryFn: () => api.noteLinks(id as string),
    enabled: Boolean(id),
    staleTime: 4_000,
  });
}

export function useFolders() {
  return useQuery({
    queryKey: queryKeys.folders,
    queryFn: api.listFolders,
    staleTime: 15_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: queryKeys.tags,
    queryFn: api.listTags,
    staleTime: 15_000,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: api.listTemplates,
    staleTime: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: api.getSettings,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: api.getAppInfo,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useIndexStats() {
  return useQuery({
    queryKey: queryKeys.indexStats,
    queryFn: api.getIndexStats,
    staleTime: 10_000,
  });
}

export function useSearchNotes(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: () => api.searchNotes(trimmed, 40),
    enabled: trimmed.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useCreateNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { folderId: string | null; templateId: string | null }) =>
      api.createNote(input.folderId, input.templateId),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useRenameNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; title: string }) =>
      api.renameNote(input.id, input.title),
    onSuccess: (_data, input) => {
      invalidateNoteLists(client);
      void client.invalidateQueries({ queryKey: queryKeys.note(input.id) });
    },
  });
}

export function useToggleFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; favorite: boolean }) =>
      api.setNoteFavorite(input.id, input.favorite),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useMoveNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; folderId: string | null }) =>
      api.moveNote(input.id, input.folderId),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useTrashNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.trashNote(id),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useRestoreNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreNote(id),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function usePurgeNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.purgeNote(id),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useEmptyTrash() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.emptyTrash(),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useDuplicateNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.duplicateNote(id),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useTouchNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.touchNote(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useSetNoteTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: string; names: string[] }) =>
      api.setNoteTags(input.noteId, input.names),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useCreateFolder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      api.createFolder(input.name, input.parentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.folders });
    },
  });
}

export function useRenameFolder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api.renameFolder(input.id, input.name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.folders });
      void client.invalidateQueries({ queryKey: ["notes"] });
      void client.invalidateQueries({ queryKey: ["search"] });
    },
  });
}

export function useMoveFolder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; parentId: string | null; sortOrder?: number }) =>
      api.moveFolder(input.id, input.parentId, input.sortOrder ?? 0),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.folders });
      void client.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

export function useDeleteFolder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteFolder(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.folders });
    },
  });
}

export function useRenameTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string }) => api.renameTag(input.id, input.name),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => invalidateNoteLists(client),
  });
}

export function useSaveNoteAsTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { noteId: string; name: string }) =>
      api.saveNoteAsTemplate(input.noteId, input.name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.templates });
    },
  });
}

export function useUpdateSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { key: keyof AppSettings; value: unknown }) =>
      api.setSetting(input.key, input.value),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useResetSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.resetSettings(),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}
