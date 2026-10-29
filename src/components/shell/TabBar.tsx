import { Plus, PanelRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, displayTitle } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

interface TabBarProps {
  onNewNote: () => void;
  onToggleOutline: () => void;
}

/**
 * Tabs are the working set, not navigation history: closing a tab never
 * deletes a note, and the strip is capped by the workspace store. The tab title
 * lives in the workspace store so the strip never depends on a query that may
 * still be catching up with the latest save.
 */
export function TabBar({ onNewNote, onToggleOutline }: TabBarProps) {
  const tabs = useWorkspace((state) => state.tabs);
  const activeTabId = useWorkspace((state) => state.activeTabId);
  const setActiveTab = useWorkspace((state) => state.setActiveTab);
  const closeTab = useWorkspace((state) => state.closeTab);
  const outlineOpen = useWorkspace((state) => state.outlineOpen);

  return (
    <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-surface/60">
      <div className="scrollbar-none flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.length === 0 ? (
          <div className="flex items-center px-3 text-ui-xs text-muted-foreground/70">
            No open notes
          </div>
        ) : null}
        {tabs.map((tab) => {
          const active = tab.noteId === activeTabId;
          const title = tab.title;
          return (
            <div
              key={tab.noteId}
              className={cn(
                "group/tab relative flex h-full min-w-0 max-w-[220px] shrink-0 items-center border-r border-border/70 pl-3 pr-1.5 transition-colors",
                active
                  ? "bg-editor text-foreground"
                  : "text-muted-foreground hover:bg-surface-raised/60 hover:text-foreground",
              )}
            >
              {active ? (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-primary/80" />
              ) : null}
              <button
                type="button"
                className="min-w-0 flex-1 truncate py-2 pr-1 text-left text-ui-sm"
                onClick={() => setActiveTab(tab.noteId)}
                onAuxClick={(event) => {
                  if (event.button === 1) closeTab(tab.noteId);
                }}
                title={displayTitle(title)}
              >
                {displayTitle(title)}
              </button>
              <button
                type="button"
                aria-label={`Close ${displayTitle(title)}`}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/tab:opacity-100"
                onClick={() => closeTab(tab.noteId)}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 px-1.5">
        <Tooltip label="New note" shortcut="Ctrl N">
          <Button variant="ghost" size="icon-sm" onClick={onNewNote} aria-label="New note">
            <Plus />
          </Button>
        </Tooltip>
        <Tooltip label={outlineOpen ? "Hide outline" : "Show outline"} shortcut="Ctrl ⇧ O">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={outlineOpen ? "Hide outline" : "Show outline"}
            aria-pressed={outlineOpen}
            className={cn(outlineOpen && "bg-accent text-accent-foreground")}
            onClick={onToggleOutline}
          >
            <PanelRight />
          </Button>
        </Tooltip>
        <Kbd className="ml-1 hidden xl:inline-flex">Ctrl K</Kbd>
      </div>
    </div>
  );
}
