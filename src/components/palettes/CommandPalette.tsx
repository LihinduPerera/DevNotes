import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Command,
  Database,
  FilePlus2,
  FolderOpen,
  Moon,
  PanelLeft,
  PanelRight,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/primitives";
import { api } from "@/lib/ipc";
import { queryKeys } from "@/lib/queries";
import { cycleTheme } from "@/lib/theme";
import { cn, errorMessage, pluralize } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

interface CommandItem {
  id: string;
  label: string;
  hint: string;
  shortcut?: string;
  keywords: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewNote: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}

export function CommandPalette({ open, onOpenChange, ...props }: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0" hideClose>
        {open ? <CommandPaletteBody onOpenChange={onOpenChange} {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CommandPaletteBody({
  onOpenChange,
  onNewNote,
  onOpenSearch,
  onOpenSettings,
}: Omit<CommandPaletteProps, "open">) {
  const client = useQueryClient();
  const setView = useWorkspace((state) => state.setView);
  const toggleSidebar = useWorkspace((state) => state.toggleSidebar);
  const outlineOpen = useWorkspace((state) => state.outlineOpen);
  const setOutlineOpen = useWorkspace((state) => state.setOutlineOpen);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "new-note",
        label: "New note",
        hint: "Create a blank note in the current folder",
        shortcut: "Ctrl N",
        keywords: "create add write",
        icon: <FilePlus2 />,
        run: onNewNote,
      },
      {
        id: "search",
        label: "Search notes",
        hint: "Full-text search across the knowledge base",
        shortcut: "Ctrl K",
        keywords: "find filter full text",
        icon: <Search />,
        run: onOpenSearch,
      },
      {
        id: "trash",
        label: "Open trash",
        hint: "Restore or permanently delete notes",
        keywords: "deleted restore purge",
        icon: <Trash2 />,
        run: () => {
          setView({ kind: "trash", name: "Trash" });
        },
      },
      {
        id: "sidebar",
        label: "Toggle sidebar",
        hint: "Show or hide folders, tags, and navigation",
        shortcut: "Ctrl B",
        keywords: "collapse expand navigation",
        icon: <PanelLeft />,
        run: toggleSidebar,
      },
      {
        id: "outline",
        label: outlineOpen ? "Hide outline" : "Show outline",
        hint: "Toggle the document outline panel",
        shortcut: "Ctrl ⇧ O",
        keywords: "structure headings sections",
        icon: <PanelRight />,
        run: () => setOutlineOpen(!outlineOpen),
      },
      {
        id: "theme",
        label: "Change theme",
        hint: "Cycle dark, light, and system appearance",
        keywords: "appearance colour color dark light",
        icon: <Moon />,
        run: cycleTheme,
      },
      {
        id: "settings",
        label: "Open settings",
        hint: "Editor, appearance, backups, and index maintenance",
        shortcut: "Ctrl ,",
        keywords: "preferences options config",
        icon: <Settings2 />,
        run: onOpenSettings,
      },
      {
        id: "data-dir",
        label: "Open data folder",
        hint: "Reveal the database and attachments directory",
        keywords: "files explorer database attachments",
        icon: <FolderOpen />,
        run: async () => {
          try {
            await api.openDataDir();
          } catch (error) {
            toast.error(errorMessage(error));
          }
        },
      },
      {
        id: "rebuild-index",
        label: "Rebuild search index",
        hint: "Repair or refresh the FTS5 index from note content",
        keywords: "fts reindex repair maintenance",
        icon: <Database />,
        run: async () => {
          try {
            const count = await api.rebuildSearchIndex();
            void client.invalidateQueries({ queryKey: queryKeys.indexStats });
            void client.invalidateQueries({ queryKey: ["search"] });
            toast.success(`Search index rebuilt (${pluralize(count, "note")})`);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        },
      },
    ],
    [
      client,
      onNewNote,
      onOpenSearch,
      onOpenSettings,
      outlineOpen,
      setOutlineOpen,
      setView,
      toggleSidebar,
    ],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint} ${command.keywords}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const item = filtered[selected];
    if (!item) return;
    rowRefs.current.get(item.id)?.scrollIntoView({ block: "nearest" });
  }, [filtered, selected]);

  const run = (item: CommandItem) => {
    onOpenChange(false);
    void item.run();
  };

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>Command palette</DialogTitle>
        <DialogDescription>Run an application command.</DialogDescription>
      </DialogHeader>

      <div className="flex h-12 items-center gap-2.5 border-b border-border px-3.5">
        <Command className="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((current) =>
                filtered.length === 0 ? 0 : (current + 1) % filtered.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) =>
                filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
              );
            } else if (event.key === "Enter") {
              const item = filtered[selected];
              if (item) {
                event.preventDefault();
                run(item);
              }
            }
          }}
          placeholder="Type a command…"
          aria-label="Command"
          className="h-8 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="scrollbar-none max-h-[56vh] min-h-[100px] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui-sm text-muted-foreground">
            No command matches “{query.trim()}”.
          </p>
        ) : (
          <div role="listbox" aria-label="Commands" className="space-y-0.5">
            {filtered.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selected}
                ref={(element) => {
                  if (element) rowRefs.current.set(item.id, element);
                  else rowRefs.current.delete(item.id);
                }}
                onMouseEnter={() => setSelected(index)}
                onClick={() => run(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                  index === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                {item.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui-sm font-medium">{item.label}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
                {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-3.5 py-1.5 text-[10.5px] text-muted-foreground/70">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd>
          Run
        </span>
        <span className="ml-auto">{filtered.length} commands</span>
      </div>
    </>
  );
}
