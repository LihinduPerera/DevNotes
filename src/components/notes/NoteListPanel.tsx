import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownWideNarrow,
  Copy,
  FilePlus2,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Badge, EmptyState } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { NameDialog } from "@/components/shell/NameDialog";
import { api } from "@/lib/ipc";
import {
  queryKeys,
  useCreateFolder,
  useDeleteFolder,
  useDuplicateNote,
  useFolders,
  useMoveNote,
  useNotes,
  useRenameNote,
  useSettings,
  useTags,
  useToggleFavorite,
  useTrashNote,
  useTemplates,
} from "@/lib/queries";
import { saveManager } from "@/lib/save-manager";
import type { ListNotesInput, NoteSort, NoteSummary } from "@/lib/types";
import {
  cn,
  displayTitle,
  errorMessage,
  formatRelative,
  pluralize,
} from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

interface NoteListPanelProps {
  onOpenNote: (note: { id: string; title: string }) => void;
  onNewNote: (templateId?: string | null) => void;
  onOpenSearch: () => void;
}

const SORT_LABELS: Record<NoteSort, string> = {
  updated: "Last edited",
  created: "Date created",
  title: "Title",
  words: "Length",
};

function buildInput(
  view: ReturnType<typeof useWorkspace.getState>["view"],
  sort: NoteSort,
  folderId: string | null,
): ListNotesInput {
  if (view.kind === "favorites") return { favorite: true, sort };
  if (view.kind === "recent") return { recent: true, sort: "updated", limit: 60 };
  if (view.kind === "folder") {
    return {
      folderId,
      includeSubfolders: false,
      sort,
    };
  }
  if (view.kind === "tag") return { tagId: view.id ?? null, sort };
  return { sort };
}

export function NoteListPanel({
  onOpenNote,
  onNewNote,
  onOpenSearch,
}: NoteListPanelProps) {
  const client = useQueryClient();
  const view = useWorkspace((state) => state.view);
  const sort = useWorkspace((state) => state.sort);
  const setSort = useWorkspace((state) => state.setSort);
  const activeTabId = useWorkspace((state) => state.activeTabId);
  const renameTab = useWorkspace((state) => state.renameTab);
  const closeTab = useWorkspace((state) => state.closeTab);

  const folderId = view.kind === "folder" ? (view.id ?? null) : null;
  const input = useMemo(() => buildInput(view, sort, folderId), [view, sort, folderId]);
  const notes = useNotes(input);
  const folders = useFolders();
  const tags = useTags();
  const templates = useTemplates();
  const settings = useSettings();

  const createFolder = useCreateFolder();
  const deleteFolder = useDeleteFolder();
  const favorite = useToggleFavorite();
  const moveNote = useMoveNote();
  const duplicate = useDuplicateNote();
  const rename = useRenameNote();
  const trash = useTrashNote();

  const [renameTarget, setRenameTarget] = useState<NoteSummary | null>(null);
  const [trashTarget, setTrashTarget] = useState<NoteSummary | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);

  const sortedFolders = useMemo(
    () => [...(folders.data ?? [])].sort((a, b) => a.path.localeCompare(b.path)),
    [folders.data],
  );

  const noteTags = view.kind === "tag" ? tags.data?.find((tag) => tag.id === view.id) : null;

  const handleRename = (note: NoteSummary, title: string) => {
    rename.mutate(
      { id: note.id, title },
      {
        onSuccess: async () => {
          renameTab(note.id, title);
          setRenameTarget(null);
          // rename_note bumps the revision; adopt it so the open session does
          // not immediately lose a CAS race against this change.
          try {
            const fresh = await api.getNote(note.id);
            saveManager.adoptRevision(fresh.revision);
            client.setQueryData(queryKeys.note(note.id), fresh);
          } catch {
            void client.invalidateQueries({ queryKey: queryKeys.note(note.id) });
          }
          toast.success("Note renamed");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const doTrash = (note: NoteSummary) => {
    trash.mutate(note.id, {
      onSuccess: () => {
        closeTab(note.id);
        setTrashTarget(null);
        toast.success("Note moved to trash", {
          description: "You can restore it from the Trash view.",
        });
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const moveMenu = (note: NoteSummary, variant: "dropdown" | "context") => {
    const items = (
      <>
        <DropdownMenuItem
          onSelect={() =>
            moveNote.mutate(
              { id: note.id, folderId: null },
              { onError: (error) => toast.error(errorMessage(error)) },
            )
          }
        >
          No folder
        </DropdownMenuItem>
        {sortedFolders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onSelect={() =>
              moveNote.mutate(
                { id: note.id, folderId: folder.id },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
          >
            {folder.path}
          </DropdownMenuItem>
        ))}
      </>
    );

    if (variant === "dropdown") {
      return (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput />
            Move to folder
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
            {items}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderInput />
          Move to folder
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          <ContextMenuItem
            onSelect={() =>
              moveNote.mutate(
                { id: note.id, folderId: null },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
          >
            No folder
          </ContextMenuItem>
          {sortedFolders.map((folder) => (
            <ContextMenuItem
              key={folder.id}
              onSelect={() =>
                moveNote.mutate(
                  { id: note.id, folderId: folder.id },
                  { onError: (error) => toast.error(errorMessage(error)) },
                )
              }
            >
              {folder.path}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  const heading =
    view.kind === "folder" || view.kind === "tag"
      ? (view.name ?? "Notes")
      : view.kind === "favorites"
        ? "Favorites"
        : view.kind === "recent"
          ? "Recently opened"
          : "All notes";

  const count = notes.data?.length ?? 0;

  return (
    <div className="flex w-[276px] shrink-0 flex-col border-r border-border bg-surface/35">
      <div className="flex h-12 shrink-0 items-center gap-1.5 px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui-sm font-semibold tracking-[-0.01em]">{heading}</p>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {notes.isPending ? "Loading…" : pluralize(count, "note")}
            {noteTags ? ` tagged #${noteTags.name}` : ""}
          </p>
        </div>
        <Tooltip label="Search notes" shortcut="Ctrl K">
          <Button variant="ghost" size="icon-sm" onClick={onOpenSearch} aria-label="Search notes">
            <Search />
          </Button>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="icon-sm" aria-label="New note">
              <FilePlus2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={() => onNewNote(null)}>
              <FilePlus2 />
              Blank note
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setFolderDialog(true)}>
              <FolderInput />
              New folder here
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/80">
              From template
            </div>
            {(templates.data ?? []).map((template) => (
              <DropdownMenuItem
                key={template.id}
                onSelect={() => onNewNote(template.id)}
              >
                <Sparkles />
                <span className="min-w-0 flex-1 truncate">{template.name}</span>
                <span className="max-w-24 truncate text-[10.5px] text-muted-foreground">
                  {template.description}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 border-y border-border/60 px-2">
        <ArrowDownWideNarrow className="size-3.5 text-muted-foreground/70" />
        <Select value={sort} onValueChange={(value) => setSort(value as NoteSort)}>
          <SelectTrigger
            aria-label="Sort notes"
            className="h-6 border-transparent bg-transparent px-1.5 text-ui-xs hover:bg-accent/60"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {(Object.keys(SORT_LABELS) as NoteSort[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {notes.isPending ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="space-y-1.5 rounded-md p-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted/70" />
                <div className="h-2.5 w-full animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        ) : notes.isError ? (
          <EmptyState
            title="Could not load notes"
            description={errorMessage(notes.error)}
            action={
              <Button size="sm" variant="outline" onClick={() => void notes.refetch()}>
                Try again
              </Button>
            }
          />
        ) : count === 0 ? (
          <EmptyState
            title={view.kind === "favorites" ? "No favorites yet" : "Nothing here yet"}
            description={
              view.kind === "favorites"
                ? "Star a note to keep it within reach."
                : view.kind === "tag"
                  ? "No notes carry this tag yet."
                  : "Create a note to start capturing what you learn."
            }
            action={
              <Button size="sm" variant="outline" onClick={() => onNewNote(null)}>
                <FilePlus2 />
                New note
              </Button>
            }
          />
        ) : (
          <div className="space-y-0.5">
            {notes.data.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                active={note.id === activeTabId}
                onOpen={() => onOpenNote({ id: note.id, title: note.title })}
                onRename={() => setRenameTarget(note)}
                onTrash={() => {
                  if (settings.data?.confirmDelete === false) {
                    doTrash(note);
                  } else {
                    setTrashTarget(note);
                  }
                }}
                onToggleFavorite={() =>
                  favorite.mutate(
                    { id: note.id, favorite: !note.isFavorite },
                    { onError: (error) => toast.error(errorMessage(error)) },
                  )
                }
                onDuplicate={() =>
                  duplicate.mutate(note.id, {
                    onSuccess: (copy) => {
                      onOpenNote({ id: copy.id, title: copy.title });
                      toast.success("Note duplicated");
                    },
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
                moveMenu={moveMenu}
              />
            ))}
          </div>
        )}
      </div>

      <NameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title="Rename note"
        description="The title is saved together with the document. Open editors will keep their content."
        label="Note title"
        initialValue={renameTarget?.title ?? ""}
        submitLabel="Rename"
        pending={rename.isPending}
        onSubmit={(value) => {
          if (renameTarget) handleRename(renameTarget, value);
        }}
      />

      <NameDialog
        open={folderDialog}
        onOpenChange={setFolderDialog}
        title="New folder"
        description={
          view.kind === "folder"
            ? `Created inside “${view.name ?? "folder"}”.`
            : "Creates a folder at the top level."
        }
        label="Folder name"
        placeholder="Systems, Gameplay, Levels…"
        submitLabel="Create folder"
        pending={createFolder.isPending}
        onSubmit={(name) => {
          createFolder.mutate(
            { name, parentId: view.kind === "folder" ? (view.id ?? null) : null },
            {
              onSuccess: () => {
                setFolderDialog(false);
                void client.invalidateQueries({ queryKey: queryKeys.folders });
                toast.success("Folder created");
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          );
        }}
      />

      <ConfirmDialog
        open={trashTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTrashTarget(null);
        }}
        title={`Move “${displayTitle(trashTarget?.title)}” to trash?`}
        description="The note leaves lists and search, but can be restored from Trash. It is only deleted permanently when you empty the trash."
        confirmLabel="Move to trash"
        destructive
        pending={trash.isPending}
        onConfirm={() => {
          if (trashTarget) doTrash(trashTarget);
        }}
      />

      {/* Keeps folder deletion discoverable from the list for the current folder. */}
      {view.kind === "folder" && folders.data ? (
        <FolderFooter
          folderId={folderId}
          onDelete={() => {
            const target = folders.data?.find((folder) => folder.id === folderId);
            if (!target) return;
            deleteFolder.mutate(target.id, {
              onSuccess: () => {
                useWorkspace.getState().setView({ kind: "all", name: "All notes" });
                toast.success("Folder deleted");
              },
              onError: (error) => toast.error(errorMessage(error)),
            });
          }}
        />
      ) : null}
    </div>
  );
}

function FolderFooter({
  folderId,
  onDelete,
}: {
  folderId: string | null;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!folderId) return null;

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-border/60 px-3">
      <span className="text-[10.5px] text-muted-foreground/70">Folder view</span>
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
        Delete folder
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this folder?"
        description="Only empty folders can be deleted. Notes and subfolders are never removed implicitly."
        confirmLabel="Delete folder"
        destructive
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
      />
    </div>
  );
}

interface NoteRowProps {
  note: NoteSummary;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onTrash: () => void;
  onToggleFavorite: () => void;
  onDuplicate: () => void;
  moveMenu: (note: NoteSummary, variant: "dropdown" | "context") => ReactNode;
}

function NoteRow({
  note,
  active,
  onOpen,
  onRename,
  onTrash,
  onToggleFavorite,
  onDuplicate,
  moveMenu,
}: NoteRowProps) {
  const menuItems = (
    <>
      <DropdownMenuItem onSelect={onRename}>
        <Pencil />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onDuplicate}>
        <Copy />
        Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onToggleFavorite}>
        <Star />
        {note.isFavorite ? "Remove favorite" : "Add to favorites"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {moveMenu(note, "dropdown")}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={onTrash}
      >
        <Trash2 />
        Move to trash
      </DropdownMenuItem>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group/note relative cursor-default rounded-[6px] border border-transparent px-2 py-1.5 transition-colors",
            active
              ? "border-primary/25 bg-primary/10"
              : "hover:border-border/60 hover:bg-surface-raised/70",
          )}
          onClick={onOpen}
        >
          <div className="flex items-start gap-1">
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-ui-sm font-medium",
                active ? "text-foreground" : "text-foreground/90",
              )}
            >
              {displayTitle(note.title)}
            </p>
            {note.isFavorite ? (
              <Star className="mt-0.5 size-3 shrink-0 fill-primary/25 text-primary" />
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${displayTitle(note.title)}`}
                  className="-mr-1 -mt-0.5 opacity-0 focus-visible:opacity-100 group-hover/note:opacity-100 data-[state=open]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {menuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {note.excerpt.trim() || "No content yet"}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground/80">
            <span className="shrink-0 tabular">{formatRelative(note.updatedAt)}</span>
            {note.folderPath ? (
              <span className="min-w-0 truncate text-muted-foreground/65">
                · {note.folderPath}
              </span>
            ) : null}
            {note.tags.length > 0 ? (
              <span className="ml-auto flex min-w-0 shrink-0 gap-1">
                {note.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag.id} variant="secondary" className="max-w-16 truncate px-1 py-0 text-[9.5px]">
                    #{tag.name}
                  </Badge>
                ))}
                {note.tags.length > 2 ? (
                  <span className="text-[9.5px]">+{note.tags.length - 2}</span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDuplicate}>
          <Copy />
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggleFavorite}>
          <Star />
          {note.isFavorite ? "Remove favorite" : "Add to favorites"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {moveMenu(note, "context")}
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onTrash}
        >
          <Trash2 />
          Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
