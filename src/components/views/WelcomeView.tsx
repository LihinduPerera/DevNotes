import { useMemo, type ReactNode } from "react";
import {
  BookOpen,
  Command,
  FilePlus2,
  FolderTree,
  Keyboard,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, SectionLabel } from "@/components/ui/primitives";
import { useTemplates } from "@/lib/queries";
import type { TemplateSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Ctrl", "N"], label: "Create a note" },
  { keys: ["Ctrl", "K"], label: "Search notes" },
  { keys: ["Ctrl", "⇧", "P"], label: "Command palette" },
  { keys: ["Ctrl", "W"], label: "Close the current tab" },
  { keys: ["Ctrl", "B"], label: "Collapse the sidebar" },
  { keys: ["Ctrl", "S"], label: "Save immediately" },
];

export function WelcomeView({
  onNewNote,
  onOpenSearch,
  onOpenCommands,
}: {
  onNewNote: (templateId?: string | null) => void;
  onOpenSearch: () => void;
  onOpenCommands: () => void;
}) {
  const templates = useTemplates();

  const featured = useMemo(
    () => [...(templates.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 4),
    [templates.data],
  );

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto bg-editor">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-8 py-14">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-[9px] border border-primary/35 bg-primary/12 text-primary">
            <BookOpen className="size-[18px]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              Local-first
            </p>
            <h1 className="text-[19px] font-semibold tracking-[-0.02em]">UnrealNotes</h1>
          </div>
        </div>

        <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          A structured notebook for Unreal Engine work. Write in collapsible
          outlines, link notes to each other, and keep everything in a single
          local database that never leaves this machine.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Button onClick={() => onNewNote(null)}>
            <FilePlus2 />
            New note
            <Kbd className="ml-1 border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/80">
              Ctrl N
            </Kbd>
          </Button>
          <Button variant="outline" onClick={onOpenSearch}>
            <Search />
            Search
            <Kbd className="ml-1">Ctrl K</Kbd>
          </Button>
          <Button variant="ghost" onClick={onOpenCommands}>
            <Command />
            Commands
          </Button>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<FolderTree />}
            title="Outline-first writing"
            body="Headings fold with a gutter chevron. The outline panel mirrors the document structure as you type."
          />
          <FeatureCard
            icon={<Sparkles />}
            title="Templates that carry structure"
            body="Start from a blank page or a system-design template with headings already in place."
          />
          <FeatureCard
            icon={<Search />}
            title="Full-text search"
            body="SQLite FTS5 indexes titles, bodies, folders, and tags in the same transaction as every save."
          />
          <FeatureCard
            icon={<Keyboard />}
            title="Keyboard first"
            body="Every navigation surface opens from the keyboard, including the note-link picker inside the editor."
          />
        </div>

        <div className="mt-10">
          <SectionLabel className="px-0">Start from a template</SectionLabel>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(featured.length > 0
              ? featured
              : [
                  {
                    id: "",
                    name: "Blank note",
                    description: "An empty document.",
                    icon: "file",
                    isBuiltin: true,
                    sortOrder: 0,
                  } satisfies TemplateSummary,
                ]
            ).map((template) => (
              <button
                key={template.id || "blank"}
                type="button"
                onClick={() => onNewNote(template.id || null)}
                className="group flex items-start gap-2.5 rounded-lg border border-border/70 bg-surface/50 p-3 text-left transition-colors hover:border-primary/30 hover:bg-surface-raised"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground group-hover:text-primary">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-ui-sm font-medium">{template.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {template.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-x-8 gap-y-1.5 border-t border-border/70 pt-5 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center justify-between gap-3 py-0.5">
              <span className="text-ui-xs text-muted-foreground">{shortcut.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/60">
          Everything is stored in a SQLite database in your app data directory.
          Backups are validated before they are ever restored.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/70 bg-surface/35 p-3.5")}>
      <div className="flex items-center gap-2 text-muted-foreground [&_svg]:size-3.5">
        {icon}
        <p className="text-ui-sm font-medium text-foreground/90">{title}</p>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
