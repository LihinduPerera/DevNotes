import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { blockIdForHeading } from "./folding";

export const blockIdsPluginKey = new PluginKey("blockIds");

/**
 * Attaches a stable `blockId` to every heading so folding state, outline
 * entries, and future anchors survive re-renders and reloads.
 */
export const BlockIds = Extension.create({
  name: "blockIds",

  addGlobalAttributes() {
    return [
      {
        types: ["heading"],
        attributes: {
          blockId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) =>
              typeof attributes.blockId === "string" && attributes.blockId.length > 0
                ? { "data-block-id": attributes.blockId }
                : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdsPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const seen = new Set<string>();
          const missing: Array<{ pos: number; id: string }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "heading") return;
            const current = node.attrs.blockId;
            if (typeof current === "string" && current.length > 0 && !seen.has(current)) {
              seen.add(current);
              return;
            }
            const id = blockIdForHeading();
            seen.add(id);
            missing.push({ pos, id });
          });

          if (missing.length === 0) return null;

          const tr = newState.tr;
          for (const entry of missing) {
            const node = tr.doc.nodeAt(entry.pos);
            if (!node) continue;
            tr.setNodeMarkup(entry.pos, undefined, { ...node.attrs, blockId: entry.id });
          }
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
