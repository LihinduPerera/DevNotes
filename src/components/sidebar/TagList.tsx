import { Hash, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { TagSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Button } from "@/components/ui/button";

export function TagList({
  tags,
  activeTagId,
  onSelect,
  onRename,
  onDelete,
}: {
  tags: TagSummary[];
  activeTagId: string | null;
  onSelect: (tag: TagSummary) => void;
  onRename: (tag: TagSummary) => void;
  onDelete: (tag: TagSummary) => void;
}) {
  if (tags.length === 0) {
    return (
      <p className="px-3 py-1.5 text-ui-xs leading-relaxed text-muted-foreground/80">
        Tags appear here once you add them to a note.
      </p>
    );
  }

  return (
    <div className="space-y-px">
      {tags
        .filter((tag) => tag.noteCount > 0)
        .map((tag) => {
          const active = activeTagId === tag.id;
          const items = (
            <>
              <DropdownMenuItem onSelect={() => onRename(tag)}>
                <Pencil />
                Rename tag
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(tag)}
              >
                <Trash2 />
                Delete tag
              </DropdownMenuItem>
            </>
          );

          return (
            <ContextMenu key={tag.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "group/tag flex h-[26px] items-center gap-1 rounded-[5px] px-2 text-ui-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
                    onClick={() => onSelect(tag)}
                  >
                    <Hash className="size-3 shrink-0 text-muted-foreground/70" />
                    <span className="truncate">{tag.name}</span>
                    <span className="ml-auto shrink-0 pr-0.5 text-[10.5px] tabular text-muted-foreground/70">
                      {tag.noteCount}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Actions for ${tag.name}`}
                        className="opacity-0 focus-visible:opacity-100 group-hover/tag:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right" className="w-40">
                      {items}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-40">
                <ContextMenuItem onSelect={() => onRename(tag)}>
                  <Pencil />
                  Rename tag
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDelete(tag)}
                >
                  <Trash2 />
                  Delete tag
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
    </div>
  );
}
