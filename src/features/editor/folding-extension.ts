import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import { hiddenRanges, topLevelBlocks } from "./folding";

export interface FoldState {
  folded: Set<string>;
}

export const foldingPluginKey = new PluginKey<FoldState>("folding");

export function foldedIds(editor: Editor | null): Set<string> {
  if (!editor) return new Set();
  return foldingPluginKey.getState(editor.state)?.folded ?? new Set();
}

export function toggleFold(editor: Editor, blockId: string): void {
  const current = foldedIds(editor);
  const next = new Set(current);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  editor.view.dispatch(editor.state.tr.setMeta(foldingPluginKey, { folded: next }));
}

export function setFoldedHeadings(editor: Editor, ids: Iterable<string>): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(foldingPluginKey, { folded: new Set(ids) }),
  );
}

export function clearFolds(editor: Editor): void {
  setFoldedHeadings(editor, []);
}

/**
 * Hides the body of folded headings with node decorations and renders a
 * chevron in the left gutter of every heading that owns content.
 */
export const Folding = Extension.create({
  name: "folding",

  addProseMirrorPlugins() {
    return [
      new Plugin<FoldState>({
        key: foldingPluginKey,
        state: {
          init: () => ({ folded: new Set() }),
          apply(transaction, value) {
            const meta = transaction.getMeta(foldingPluginKey) as FoldState | undefined;
            if (meta?.folded) return { folded: new Set(meta.folded) };
            return value;
          },
        },
        props: {
          decorations(state) {
            const folded = foldingPluginKey.getState(state)?.folded ?? new Set<string>();
            const blocks = topLevelBlocks(state.doc);
            const decorations: Decoration[] = [];

            for (const range of hiddenRanges(blocks, folded)) {
              for (const block of blocks) {
                if (block.pos >= range.from && block.pos + block.size <= range.to) {
                  decorations.push(
                    Decoration.node(block.pos, block.pos + block.size, {
                      class: "fold-hidden",
                    }),
                  );
                }
              }
            }

            blocks.forEach((block, index) => {
              if (block.type !== "heading" || !block.blockId) return;
              const level = block.level ?? 1;
              const next = blocks[index + 1];
              const hasChildren = Boolean(next && (next.type === "heading" ? (next.level ?? 1) > level : true));
              if (!hasChildren) return;

              const isFolded = folded.has(block.blockId);
              decorations.push(
                Decoration.widget(
                  block.pos + 1,
                  () => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "fold-toggle";
                    button.dataset.foldId = block.blockId as string;
                    button.dataset.folded = String(isFolded);
                    button.tabIndex = -1;
                    button.setAttribute("aria-label", isFolded ? "Unfold section" : "Fold section");
                    button.setAttribute("aria-expanded", String(!isFolded));
                    button.textContent = isFolded ? "▸" : "▾";
                    return button;
                  },
                  { side: -1, ignoreSelection: true },
                ),
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
