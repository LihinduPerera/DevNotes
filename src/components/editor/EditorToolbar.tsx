import { useState, type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Unlink,
  WholeWord,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

interface EditorToolbarProps {
  editor: Editor;
  onInsertNoteLink: () => void;
}

export function EditorToolbar({ editor, onInsertNoteLink }: EditorToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      highlight: current.isActive("highlight"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      taskList: current.isActive("taskList"),
      blockquote: current.isActive("blockquote"),
      codeBlock: current.isActive("codeBlock"),
      link: current.isActive("link"),
      align: current.isActive({ textAlign: "center" })
        ? "center"
        : current.isActive({ textAlign: "right" })
          ? "right"
          : "left",
      block: current.isActive("heading", { level: 1 })
        ? "h1"
        : current.isActive("heading", { level: 2 })
          ? "h2"
          : current.isActive("heading", { level: 3 })
            ? "h3"
            : current.isActive("heading", { level: 4 })
              ? "h4"
              : "paragraph",
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      inTable: current.isActive("table"),
    }),
  });

  const openLinkDialog = () => {
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    setLinkValue(previous);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const raw = linkValue.trim();
    if (!raw) return;
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("/") ? raw : `https://${raw}`;
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: raw,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-surface/50 px-2 scrollbar-none">
      <ToolbarButton
        label="Undo"
        shortcut="Ctrl Z"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        shortcut="Ctrl ⇧ Z"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 />
      </ToolbarButton>

      <Divider />

      <Select
        value={state.block}
        onValueChange={(value) => {
          if (value === "paragraph") {
            editor.chain().focus().setParagraph().run();
            return;
          }
          const level = Number(value.slice(1)) as 1 | 2 | 3 | 4;
          editor.chain().focus().toggleHeading({ level }).run();
        }}
      >
        <SelectTrigger
          aria-label="Block type"
          className="h-7 w-[124px] border-transparent bg-transparent px-2 text-ui-xs hover:bg-accent/60"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="paragraph">
            <span className="flex items-center gap-1.5">
              <WholeWord className="size-3" /> Paragraph
            </span>
          </SelectItem>
          <SelectItem value="h1">
            <span className="flex items-center gap-1.5">
              <Heading1 className="size-3" /> Heading 1
            </span>
          </SelectItem>
          <SelectItem value="h2">
            <span className="flex items-center gap-1.5">
              <Heading2 className="size-3" /> Heading 2
            </span>
          </SelectItem>
          <SelectItem value="h3">
            <span className="flex items-center gap-1.5">
              <Heading3 className="size-3" /> Heading 3
            </span>
          </SelectItem>
          <SelectItem value="h4">
            <span className="flex items-center gap-1.5">
              <Heading3 className="size-3" /> Heading 4
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Divider />

      <ToolbarButton
        label="Bold"
        shortcut="Ctrl B"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        shortcut="Ctrl I"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        shortcut="Ctrl U"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        label="Inline code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code />
      </ToolbarButton>
      <ToolbarButton
        label="Highlight"
        active={state.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Align left"
        active={state.align === "left"}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={state.align === "center"}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={state.align === "right"}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Bullet list"
        active={state.bulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton
        label="Task list"
        active={state.taskList}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Quote"
        active={state.blockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={state.codeBlock}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 />
      </ToolbarButton>
      <ToolbarButton
        label="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus />
      </ToolbarButton>
      <ToolbarButton
        label="Insert table"
        active={state.inTable}
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      >
        <Table2 />
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Link" active={state.link} onClick={openLinkDialog}>
        <Link2 />
      </ToolbarButton>
      {state.link ? (
        <ToolbarButton
          label="Remove link"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink />
        </ToolbarButton>
      ) : null}
      <ToolbarButton label="Link to a note" onClick={onInsertNoteLink}>
        <span className="flex items-center gap-0.5 font-mono text-[10px] font-semibold">
          [[<span className="text-muted-foreground">]]</span>
        </span>
      </ToolbarButton>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add a link</DialogTitle>
              <DialogDescription>
                Web links open in your default browser. Note links use the
                internal <code className="font-mono text-[11px]">note://</code> scheme.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="editor-link-url" className="text-ui-sm">
                URL
              </Label>
              <Input
                id="editor-link-url"
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                placeholder="https://dev.epicgames.com/…"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinkOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!linkValue.trim()}>
                Add link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
          active && "bg-accent text-accent-foreground",
        )}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border/80" />;
}
