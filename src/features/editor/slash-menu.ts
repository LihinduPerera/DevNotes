import { Extension } from "@tiptap/core";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import type { Editor, Range } from "@tiptap/core";

interface SlashItem {
  title: string;
  hint: string;
  group: "Basic" | "Lists" | "Blocks";
  keywords: string;
  run: (props: { editor: Editor; range: Range }) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    hint: "Plain paragraph",
    group: "Basic",
    keywords: "text paragraph body",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    hint: "Section title",
    group: "Basic",
    keywords: "h1 heading title",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    hint: "Sub-section",
    group: "Basic",
    keywords: "h2 heading subtitle",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    hint: "Small section",
    group: "Basic",
    keywords: "h3 heading",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet list",
    hint: "Unordered list",
    group: "Lists",
    keywords: "bullet list unordered",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    hint: "Ordered list",
    group: "Lists",
    keywords: "number ordered list",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Task list",
    hint: "Checklist with boxes",
    group: "Lists",
    keywords: "task todo checkbox check",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: "Quote",
    hint: "Call out a passage",
    group: "Blocks",
    keywords: "quote blockquote citation",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    hint: "Syntax-highlighted code",
    group: "Blocks",
    keywords: "code snippet pre cpp",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Table",
    hint: "3 x 3 with header row",
    group: "Blocks",
    keywords: "table grid columns rows",
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    title: "Divider",
    hint: "Horizontal rule",
    group: "Blocks",
    keywords: "divider rule horizontal separator",
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function matchItems(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) =>
    `${item.title} ${item.hint} ${item.keywords}`.toLowerCase().includes(needle),
  );
}

function createMenu() {
  const container = document.createElement("div");
  container.className = "slash-menu";
  container.style.position = "fixed";
  container.style.display = "none";
  document.body.appendChild(container);

  let items: SlashItem[] = [];
  let selected = 0;
  let select: (item: SlashItem) => void = () => {};

  const paint = () => {
    container.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "slash-menu-group";
      empty.textContent = "No matching blocks";
      container.appendChild(empty);
      return;
    }
    let group = "";
    items.forEach((item, index) => {
      if (item.group !== group) {
        group = item.group;
        const label = document.createElement("div");
        label.className = "slash-menu-group";
        label.textContent = group;
        container.appendChild(label);
      }
      const row = document.createElement("div");
      row.className = "slash-menu-item";
      row.dataset.selected = String(index === selected);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === selected));

      const title = document.createElement("span");
      title.textContent = item.title;
      const hint = document.createElement("span");
      hint.className = "ml-auto text-[11px] text-muted-foreground";
      hint.textContent = item.hint;

      row.append(title, hint);
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        select(item);
      });
      container.appendChild(row);
    });
  };

  const place = (rect: DOMRect | null) => {
    if (!rect) {
      container.style.display = "none";
      return;
    }
    container.style.display = "block";
    const width = 260;
    const maxTop = window.innerHeight - 340;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 6, Math.max(8, maxTop));
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
  };

  return {
    container,
    paint,
    place,
    setItems(next: SlashItem[]) {
      items = next;
      selected = 0;
      paint();
    },
    move(delta: number) {
      if (items.length === 0) return;
      selected = (selected + delta + items.length) % items.length;
      paint();
    },
    get current(): SlashItem | undefined {
      return items[selected];
    },
    setSelect(fn: (item: SlashItem) => void) {
      select = fn;
    },
    destroy() {
      container.remove();
    },
  };
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      Suggestion<SlashItem>({
        editor,
        pluginKey: new PluginKey("slashMenu"),
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        command: ({ range, props }) => {
          props.run({ editor, range });
        },
        items: ({ query }) => matchItems(query),
        render: () => {
          const menu = createMenu();
          return {
            onStart(props: SuggestionProps<SlashItem>) {
              menu.setSelect((item) => props.command(item));
              menu.setItems(props.items);
              menu.place(props.clientRect?.() ?? null);
            },
            onUpdate(props: SuggestionProps<SlashItem>) {
              menu.setSelect((item) => props.command(item));
              menu.setItems(props.items);
              menu.place(props.clientRect?.() ?? null);
            },
            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === "Escape") {
                menu.place(null);
                return true;
              }
              if (props.event.key === "ArrowDown") {
                menu.move(1);
                return true;
              }
              if (props.event.key === "ArrowUp") {
                menu.move(-1);
                return true;
              }
              if (props.event.key === "Enter") {
                const item = menu.current;
                if (!item) return false;
                props.event.preventDefault();
                item.run({ editor, range: props.range });
                return true;
              }
              return false;
            },
            onExit() {
              menu.place(null);
            },
          };
        },
      }),
    ];
  },
});
