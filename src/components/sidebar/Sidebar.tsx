import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Clock,
  Command,
  FolderPlus,
  Layers2,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Star,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd, SectionLabel } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { FolderTree } from "./FolderTree";
import { TagList } from "./TagList";
import { NameDialog } from "@/components/shell/NameDialog";
import {
  useCreateFolder,
  useDeleteFolder,
  useDeleteTag,
  useFolders,
  useRenameFolder,
  useRenameTag,
  useTags,
} from "@/lib/queries";
import { queryKeys } from "@/lib/queries";
import type { FolderSummary, TagSummary } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { themeLabel, useThemeMode, cycleTheme } from "@/lib/theme";
import { useWorkspace, type ViewKind } from "@/stores/workspace";

interface SidebarProps {
  collapsed: boolean;
  onCreateNote: () => void;
  onOpenSearch: () => void;
  onOpenCommands: () => void;
  onOpenSettings: () => void;
}

const NAV_ITEMS: Array<{ kind: ViewKind; label: string; icon: typeof BookOpen; name: string }> = [
  { kind: "all", label: "All notes", icon: BookOpen, name: "All notes" },
  { kind: "favorites", label: "Favorites", icon: Star, name: "Favorites" },
  { kind: "recent", label: "Recently opened", icon: Clock, name: "Recently opened" },
  { kind: "trash", label: "Trash", icon: Trash2, name: "Trash" },
];

const FOLDER_NAME_INITIAL = "";

export function Sidebar({
  collapsed,
  onCreateNote,
  onOpenSearch,
  onOpenCommands,
  onOpenSettings,
}: SidebarProps) {
  const client = useQueryClient();
  const view = useWorkspace((state) => state.view);
  const setView = useWorkspace((state) => state.setView);
  const setFolderExpanded = useWorkspace((state) => state.setFolderExpanded);
  const toggleSidebar = useWorkspace((state) => state.toggleSidebar);

  const folders = useFolders();
  const tags = useTags();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const renameTag = useRenameTag();
  const deleteTag = useDeleteTag();

  const [folderDialog, setFolderDialog] = useState<
    | { mode: "create"; parentId: string | null }
    | { mode: "rename"; folder: FolderSummary }
    | null
  >(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderSummary | null>(null);
  const [tagDialog, setTagDialog] = useState<TagSummary | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TagSummary | null>(null);
  const theme = useThemeMode();

  const activeFolderId = view.kind === "folder" ? (view.id ?? null) : null;
  const activeTagId = view.kind === "tag" ? (view.id ?? null) : null;

  const refreshTaxonomy = () => {
    void client.invalidateQueries({ queryKey: queryKeys.folders });
    void client.invalidateQueries({ queryKey: queryKeys.tags });
    void client.invalidateQueries({ queryKey: ["notes"] });
  };

  const submitFolder = (name: string) => {
    if (!folderDialog) return;
    if (folderDialog.mode === "create") {
      createFolder.mutate(
        { name, parentId: folderDialog.parentId },
        {
          onSuccess: (folder) => {
            setFolderDialog(null);
            refreshTaxonomy();
            if (folder.parentId) setFolderExpanded(folder.parentId, true);
            if (folder.parentId) setFolderExpanded(folder.id, false);
            toast.success(`Folder “${folder.name}” created`);
          },
          onError: (error) => toast.error(errorMessage(error)),
        },
      );
      return;
    }

    renameFolder.mutate(
      { id: folderDialog.folder.id, name },
      {
        onSuccess: () => {
          setFolderDialog(null);
          refreshTaxonomy();
          toast.success("Folder renamed");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const submitTag = (name: string) => {
    if (!tagDialog) return;
    renameTag.mutate(
      { id: tagDialog.id, name },
      {
        onSuccess: () => {
          setTagDialog(null);
          refreshTaxonomy();
          toast.success("Tag renamed");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const folderActions = {
    onCreate: (parentId: string) =>
      setFolderDialog({ mode: "create", parentId }),
    onRename: (folder: FolderSummary) => setFolderDialog({ mode: "rename", folder }),
    onDelete: (folder: FolderSummary) => setFolderToDelete(folder),
  };

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-2">
        <Tooltip label="Expand sidebar" side="right">
          <Button variant="ghost" size="icon-sm" onClick={toggleSidebar} aria-label="Expand sidebar">
            <PanelLeftOpen />
          </Button>
        </Tooltip>
        <div className="my-1 h-px w-6 bg-sidebar-border" />
        <Tooltip label="New note" side="right" shortcut="Ctrl N">
          <Button variant="ghost" size="icon-sm" onClick={onCreateNote} aria-label="New note">
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip label="Search" side="right" shortcut="Ctrl K">
          <Button variant="ghost" size="icon-sm" onClick={onOpenSearch} aria-label="Search">
            <Search />
          </Button>
        </Tooltip>
        <div className="my-1 h-px w-6 bg-sidebar-border" />
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.kind} label={item.label} side="right">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={item.label}
                className={cn(view.kind === item.kind && "bg-sidebar-accent text-sidebar-accent-foreground")}
                onClick={() => setView({ kind: item.kind, name: item.name })}
              >
                <Icon />
              </Button>
            </Tooltip>
          );
        })}
        <div className="mt-auto flex flex-col gap-1">
          <Tooltip label={`Theme: ${themeLabel(theme)}`} side="right">
            <Button variant="ghost" size="icon-sm" onClick={cycleTheme} aria-label="Change theme">
              {theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <Monitor />}
            </Button>
          </Tooltip>
          <Tooltip label="Settings" side="right" shortcut="Ctrl ,">
            <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} aria-label="Settings">
              <Settings2 />
            </Button>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="flex size-7 items-center justify-center rounded-[7px] border border-primary/35 bg-primary/12 text-primary">
          <Layers2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui-sm font-semibold tracking-[-0.01em]">UnrealNotes</p>
          <p className="truncate text-[10px] uppercase tracking-[0.09em] text-muted-foreground/70">
            Local knowledge base
          </p>
        </div>
        <Tooltip label="Collapse sidebar" side="bottom">
          <Button variant="ghost" size="icon-xs" onClick={toggleSidebar} aria-label="Collapse sidebar">
            <PanelLeftClose />
          </Button>
        </Tooltip>
      </div>

      <div className="space-y-1.5 px-2.5 pb-2">
        <Button className="w-full justify-start" size="sm" onClick={onCreateNote}>
          <Plus />
          New note
          <Kbd className="ml-auto">Ctrl N</Kbd>
        </Button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-7 w-full items-center gap-2 rounded-md border border-sidebar-border/80 bg-surface/40 px-2 text-ui-sm text-muted-foreground transition-colors hover:border-border hover:bg-surface hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span>Search notes…</span>
          <Kbd className="ml-auto">Ctrl K</Kbd>
        </button>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <nav className="space-y-px">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = view.kind === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => setView({ kind: item.kind, name: item.name })}
                className={cn(
                  "flex h-[27px] w-full items-center gap-2 rounded-[5px] px-2 text-ui-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-3.5 text-muted-foreground" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-3">
          <SectionLabel
            action={
              <Tooltip label="New folder" side="left">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="New folder"
                  onClick={() => setFolderDialog({ mode: "create", parentId: null })}
                >
                  <FolderPlus />
                </Button>
              </Tooltip>
            }
          >
            Folders
          </SectionLabel>
          {folders.isPending ? (
            <div className="space-y-1 px-2 py-1">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-4 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
          ) : (
            <FolderTree
              folders={folders.data ?? []}
              activeFolderId={activeFolderId}
              onSelect={(folder) =>
                setView({ kind: "folder", id: folder.id, name: folder.name })
              }
              {...folderActions}
            />
          )}
        </div>

        <div className="mt-3">
          <SectionLabel>Tags</SectionLabel>
          {tags.isPending ? (
            <div className="space-y-1 px-2 py-1">
              {[0, 1].map((row) => (
                <div key={row} className="h-4 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
          ) : (
            <TagList
              tags={tags.data ?? []}
              activeTagId={activeTagId}
              onSelect={(tag) => setView({ kind: "tag", id: tag.id, name: tag.name })}
              onRename={setTagDialog}
              onDelete={setTagToDelete}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-sidebar-border px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start text-muted-foreground"
          onClick={onOpenCommands}
        >
          <Command className="size-3.5" />
          Commands
        </Button>
        <Tooltip label={`Theme: ${themeLabel(theme)}`} side="top">
          <Button variant="ghost" size="icon-sm" onClick={cycleTheme} aria-label="Change theme">
            {theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <Monitor />}
          </Button>
        </Tooltip>
        <Tooltip label="Settings" side="top" shortcut="Ctrl ,">
          <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} aria-label="Settings">
            <Settings2 />
          </Button>
        </Tooltip>
      </div>

      <NameDialog
        open={folderDialog !== null}
        onOpenChange={(open) => {
          if (!open) setFolderDialog(null);
        }}
        title={folderDialog?.mode === "rename" ? "Rename folder" : "New folder"}
        description={
          folderDialog?.mode === "rename"
            ? "Renaming a folder updates the path shown on every note inside it."
            : "Folders can be nested up to eight levels. Names must be unique under a parent."
        }
        label="Folder name"
        placeholder="Systems, Gameplay, Levels…"
        initialValue={
          folderDialog?.mode === "rename"
            ? folderDialog.folder.name
            : FOLDER_NAME_INITIAL
        }
        submitLabel={folderDialog?.mode === "rename" ? "Rename" : "Create folder"}
        pending={createFolder.isPending || renameFolder.isPending}
        onSubmit={submitFolder}
      />

      <NameDialog
        open={tagDialog !== null}
        onOpenChange={(open) => {
          if (!open) setTagDialog(null);
        }}
        title="Rename tag"
        description="The tag is updated on every note that uses it, and search reindexes."
        label="Tag name"
        initialValue={tagDialog?.name ?? ""}
        submitLabel="Rename"
        pending={renameTag.isPending}
        onSubmit={submitTag}
      />

      <ConfirmDialog
        open={folderToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFolderToDelete(null);
        }}
        title={`Delete “${folderToDelete?.name ?? ""}”?`}
        description="Folders must be empty before they can be deleted. Notes and subfolders are never removed implicitly."
        confirmLabel="Delete folder"
        destructive
        pending={deleteFolder.isPending}
        onConfirm={() => {
          if (!folderToDelete) return;
          deleteFolder.mutate(folderToDelete.id, {
            onSuccess: () => {
              if (activeFolderId === folderToDelete.id) {
                setView({ kind: "all", name: "All notes" });
              }
              setFolderToDelete(null);
              refreshTaxonomy();
              toast.success("Folder deleted");
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />

      <ConfirmDialog
        open={tagToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTagToDelete(null);
        }}
        title={`Delete tag “${tagToDelete?.name ?? ""}”?`}
        description="The tag is removed from every note. The notes themselves are untouched."
        confirmLabel="Delete tag"
        destructive
        pending={deleteTag.isPending}
        onConfirm={() => {
          if (!tagToDelete) return;
          deleteTag.mutate(tagToDelete.id, {
            onSuccess: () => {
              if (activeTagId === tagToDelete.id) {
                setView({ kind: "all", name: "All notes" });
              }
              setTagToDelete(null);
              refreshTaxonomy();
              toast.success("Tag deleted");
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />
    </aside>
  );
}
