import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { ChevronRight, ListTree } from "lucide-react";
import { buildOutline } from "@/features/editor/folding";
import { foldedIds, toggleFold } from "@/features/editor/folding-extension";
import { cn } from "@/lib/utils";

/**
 * The outline is derived from the live ProseMirror document, so it can never
 * drift from what is on screen. Fold state comes from the folding plugin.
 */
export function OutlinePanel({ editor }: { editor: Editor }) {
  const view = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const entries = buildOutline(current.state.doc, foldedIds(current));
      const cursor = current.state.selection.from;
      let activeBlockId: string | null = null;
      for (const entry of entries) {
        if (entry.pos <= cursor) activeBlockId = entry.blockId;
        else break;
      }
      return { entries, activeBlockId };
    },
  });

  const scrollTo = (pos: number) => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    editor.chain().focus().setTextSelection(pos + 1).run();
  };

  return (
    <aside
      aria-label="Outline"
      className="flex w-[216px] shrink-0 flex-col border-l border-border bg-surface/30"
    >
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border/70 px-3">
        <ListTree className="size-3.5 text-muted-foreground" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Outline
        </span>
        <span className="ml-auto text-[10px] tabular text-muted-foreground/70">
          {view.entries.length}
        </span>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-1.5">
        {view.entries.length === 0 ? (
          <p className="px-2 py-3 text-[11px] leading-relaxed text-muted-foreground/75">
            Add a heading to build an outline. Headings fold from the gutter in
            the editor, or from the chevrons here.
          </p>
        ) : (
          <div className="space-y-px">
            {view.entries.map((entry) => {
              const active = entry.blockId === view.activeBlockId;
              return (
                <div
                  key={entry.blockId}
                  className={cn(
                    "group/outline flex items-center gap-0.5 rounded-[5px] pr-1 transition-colors",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                  style={{ paddingLeft: Math.max(0, (entry.level - 1) * 10) }}
                >
                  <button
                    type="button"
                    aria-label={entry.folded ? "Unfold section" : "Fold section"}
                    aria-expanded={!entry.folded}
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground",
                      !entry.hasChildren && "invisible",
                    )}
                    onClick={() => toggleFold(editor, entry.blockId)}
                  >
                    <ChevronRight
                      className={cn("size-3 transition-transform", !entry.folded && "rotate-90")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo(entry.pos)}
                    className={cn(
                      "min-w-0 flex-1 truncate py-1 text-left text-[11.5px]",
                      entry.level === 1 ? "font-medium" : "text-muted-foreground",
                      active && "text-accent-foreground",
                    )}
                    title={entry.text}
                  >
                    {entry.text}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
