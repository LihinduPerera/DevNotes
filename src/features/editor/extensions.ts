import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import CharacterCount from "@tiptap/extension-character-count";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { common, createLowlight } from "lowlight";

import { BlockIds } from "./block-ids";
import { Folding } from "./folding-extension";
import { SlashCommand } from "./slash-menu";

const lowlight = createLowlight(common);
lowlight.registerAlias({ cpp: ["c++", "ue", "unreal"] });

const NoteAwareLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === "string" ? HTMLAttributes.href : "";
    return [
      "a",
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        href.startsWith("note://") ? { class: "note-link", "data-note-link": "true" } : {},
      ),
      0,
    ];
  },
});

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    codeBlock: false,
    link: false,
    horizontalRule: {},
  }),
  NoteAwareLink.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    protocols: ["http", "https", "mailto", "note"],
    isAllowedUri: (url, ctx) => url.startsWith("note://") || ctx.defaultValidate(url),
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
  }),
  Placeholder.configure({
    placeholder: "Start writing… type / for blocks, [[ to link a note",
    includeChildren: true,
  }),
  Highlight.configure({ multicolor: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  CodeBlockLowlight.configure({ lowlight, defaultLanguage: "cpp" }),
  Image.configure({ inline: false, allowBase64: false }),
  Table.configure({ resizable: true, allowTableNodeSelection: true }),
  TableRow,
  TableHeader,
  TableCell,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  CharacterCount.configure({ limit: 2_000_000 }),
  BlockIds,
  Folding,
  SlashCommand,
];
