import { useMemo } from "react";
import {
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import type { FolderSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

export interface FolderActions {
  onCreate: (parentId: string) => void;
  onRename: (folder: FolderSummary) => void;
  onDelete: (folder: FolderSummary) => void;
}

interface TreeProps extends FolderActions {
  folders: FolderSummary[];
  activeFolderId: string | null;
  onSelect: (folder: FolderSummary) => void;
}

interface NodeProps extends FolderActions {
  folder: FolderSummary;
  childrenMap: Map<string, FolderSummary[]>;
  depth: number;
  activeFolderId: string | null;
  onSelect: (folder: FolderSummary) => void;
}

function FolderNode({
  folder,
  childrenMap,
  depth,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: NodeProps) {
  const expanded = useWorkspace((state) => state.expandedFolders[folder.id] ?? false);
  const toggleFolder = useWorkspace((state) => state.toggleFolder);
  const children = childrenMap.get(folder.id) ?? [];
  const active = activeFolderId === folder.id;

  const menuItems = (
    <>
      <DropdownMenuItem onSelect={() => onCreate(folder.id)}>
        <FolderPlus />
        New subfolder
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onRename(folder)}>
        <Pencil />
        Rename
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(folder)}>
        <Trash2 />
        Delete folder
      </DropdownMenuItem>
    </>
  );

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group/row flex h-[26px] items-center gap-1 rounded-[5px] pr-1 text-ui-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
            style={{ paddingLeft: depth * 12 + 4 }}
          >
            <button
              type="button"
              aria-label={expanded ? "Collapse folder" : "Expand folder"}
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground",
                children.length === 0 && "invisible",
              )}
              onClick={(event) => {
                event.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              <ChevronRight
                className={cn("size-3 transition-transform", expanded && "rotate-90")}
              />
            </button>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
              onClick={() => {
                onSelect(folder);
                if (children.length > 0 && !expanded) toggleFolder(folder.id);
              }}
            >
              {expanded ? (
                <FolderOpen className="size-3.5 shrink-0 text-primary/80" />
              ) : (
                <FolderClosed className="size-3.5 shrink-0 text-muted-foreground/80" />
              )}
              <span className="truncate">{folder.name}</span>
              {folder.noteCount > 0 && (
                <span className="ml-auto shrink-0 pr-0.5 text-[10.5px] tabular text-muted-foreground/70">
                  {folder.noteCount}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${folder.name}`}
                  className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right" className="w-44">
                {menuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">{menuItems}</ContextMenuContent>
      </ContextMenu>

      {expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              childrenMap={childrenMap}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: TreeProps) {
  const childrenMap = useMemo(() => {
    const map = new Map<string, FolderSummary[]>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      const list = map.get(folder.parentId) ?? [];
      list.push(folder);
      map.set(folder.parentId, list);
    }
    return map;
  }, [folders]);

  const roots = useMemo(
    () =>
      folders
        .filter((folder) => !folder.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [folders],
  );

  if (roots.length === 0) {
    return (
      <p className="px-3 py-1.5 text-ui-xs leading-relaxed text-muted-foreground/80">
        No folders yet. Group notes by system, level, or discipline.
      </p>
    );
  }

  return (
    <div className="space-y-px">
      {roots.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          childrenMap={childrenMap}
          depth={0}
          activeFolderId={activeFolderId}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
