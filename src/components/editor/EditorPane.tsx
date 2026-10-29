import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  ArrowUpRight,
  Bold,
  Check,
  ChevronRight,
  Code,
  Copy,
  FilePlus2,
  Highlighter,
  History,
  Italic,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Strikethrough,
  Tag,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { EmptyState, Kbd, SectionLabel, Separator } from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { NameDialog } from "@/components/shell/NameDialog";
import { EditorToolbar } from "./EditorToolbar";
import { NoteLinkDialog } from "./NoteLinkDialog";
import { OutlinePanel } from "./OutlinePanel";
import { editorExtensions } from "@/features/editor/extensions";
import { clearFolds, foldedIds, toggleFold } from "@/features/editor/folding-extension";
import { api, assetUrl } from "@/lib/ipc";
import { journal, type JournalEntry } from "@/lib/journal";
import {
  queryKeys,
  syncNoteCache,
  useDuplicateNote,
  useNote,
  useNoteLinks,
  useSaveNoteAsTemplate,
  useSetNoteTags,
  useSettings,
  useToggleFavorite,
  useTrashNote,
} from "@/lib/queries";
import {
  saveManager,
  saveStatusLabel,
  useSaveState,
  type SaveContent,
  type SaveSession,
  type SaveStatus,
} from "@/lib/save-manager";
import type { AttachmentInfo, JSONContent, NoteDetail, TagRef, TitleSuggestion } from "@/lib/types";
import {
  cn,
  displayTitle,
  errorMessage,
  formatRelative,
  pluralize,
} from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };
const MAX_INLINE_IMAGE_BYTES = 16 * 1024 * 1024;

interface EditorPaneProps {
  noteId: string;
  onOpenNote: (note: { id: string; title: string }) => void;
}

function insertImageNode(view: EditorView, attachment: AttachmentInfo, alt: string): void {
  const node = view.state.schema.nodes.image?.create({
    src: assetUrl(attachment.storedPath),
    alt,
    title: alt,
  });
  if (!node) return;
  view.dispatch(view.state.tr.replaceSelectionWith(node));
}

async function uploadImage(noteId: string, file: File): Promise<AttachmentInfo> {
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    throw new Error("Images are limited to 16 MB");
  }
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return api.saveAttachment(noteId, file.name || "pasted-image.png", file.type || null, bytes);
}

async function insertImageFiles(noteId: string, view: EditorView, files: File[]): Promise<void> {
  for (const file of files) {
    try {
      const attachment = await uploadImage(noteId, file);
      insertImageNode(view, attachment, file.name || "Image");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
}

export function EditorPane({ noteId, onOpenNote }: EditorPaneProps) {
  const client = useQueryClient();
  const note = useNote(noteId);
  const links = useNoteLinks(noteId);
  const settings = useSettings();
  const tagMutation = useSetNoteTags();
  const favorite = useToggleFavorite();
  const duplicate = useDuplicateNote();
  const trash = useTrashNote();
  const saveAsTemplate = useSaveNoteAsTemplate();

  const renameTab = useWorkspace((state) => state.renameTab);
  const closeTab = useWorkspace((state) => state.closeTab);
  const outlineOpen = useWorkspace((state) => state.outlineOpen);

  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<TagRef[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [recovery, setRecovery] = useState<JournalEntry | null>(null);
  const [noteLinkOpen, setNoteLinkOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const titleRef = useRef("");
  const loadedIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const snapshotRef = useRef<SaveContent | null>(null);

  const status = useSaveState((state) => state.status);
  const statusNoteId = useSaveState((state) => state.noteId);
  const saveError = useSaveState((state) => state.error);
  const lastSavedAt = useSaveState((state) => state.lastSavedAt);

  const autosaveDelay = settings.data?.autosaveDelayMs ?? 800;
  const delayRef = useRef(autosaveDelay);
  useEffect(() => {
    delayRef.current = autosaveDelay;
  }, [autosaveDelay]);
  const spellcheck = settings.data?.spellcheck ?? true;

  const editor = useEditor({
    extensions: editorExtensions,
    content: EMPTY_DOC,
    autofocus: false,
    editorProps: {
      attributes: {
        class: "prose-editor",
        spellcheck: "true",
        autocorrect: "off",
        autocomplete: "off",
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        void insertImageFiles(noteId, view, files);
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (coords) {
          const selection = TextSelection.near(view.state.doc.resolve(coords.pos));
          view.dispatch(view.state.tr.setSelection(selection));
        }
        void insertImageFiles(noteId, view, files);
        return true;
      },
    },
    onUpdate({ editor: current }) {
      if (loadingRef.current) return;
      saveManager.markDirty(delayRef.current);

      // `[[` is the note-link trigger advertised by the placeholder.
      const { empty, $from } = current.state.selection;
      if (!empty || $from.parentOffset < 2) return;
      const before = $from.parent.textBetween($from.parentOffset - 2, $from.parentOffset);
      if (before !== "[[") return;
      window.setTimeout(() => {
        if (current.isDestroyed) return;
        const range = {
          from: current.state.selection.from - 2,
          to: current.state.selection.from,
        };
        if (range.from < 0) return;
        current.chain().focus().deleteRange(range).run();
        setNoteLinkOpen(true);
      }, 0);
    },
  });

  const view = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const storage = current.storage.characterCount as
        | { words?: () => number; characters?: () => number }
        | undefined;
      const folded = foldedIds(current);
      return {
        words: storage?.words?.() ?? 0,
        characters: storage?.characters?.() ?? 0,
        foldedCount: folded.size,
      };
    },
  });

  const applyNote = useCallback(
    (detail: NoteDetail) => {
      if (!editor) return;
      loadingRef.current = true;
      editor.commands.setContent(detail.doc, { emitUpdate: false });
      loadingRef.current = false;
      clearFolds(editor);
      setTitle(detail.title);
      titleRef.current = detail.title;
      setTags(detail.tags);
      // The view can be momentarily unavailable while React re-attaches effects
      // in StrictMode; content still applies through the editor state.
      if (editor.isInitialized) {
        editor.commands.focus("start", { scrollIntoView: false });
      }
    },
    [editor],
  );

  // One save session per mounted note. The session is opened *before* content
  // is replaced so keystrokes can never be attributed to the previous note.
  useEffect(() => {
    if (!editor || !note.data) return;
    const detail = note.data;
    let cancelled = false;

    const session: SaveSession = {
      noteId: detail.id,
      revision: detail.revision,
      delayMs: delayRef.current,
      getContent: () => {
        if (editor.isDestroyed) return null;
        const content: SaveContent = {
          title: titleRef.current,
          doc: editor.getJSON() as JSONContent,
        };
        snapshotRef.current = content;
        return content;
      },
      onSaved: (result) => {
        // The tab strip is powered by the workspace store, so a rename has to
        // be mirrored there as soon as the save confirms the new title.
        renameTab(result.id, result.title);
        syncNoteCache(client, result);
        const saved = snapshotRef.current;
        if (saved) {
          client.setQueryData<NoteDetail>(queryKeys.note(result.id), (previous) =>
            previous
              ? { ...previous, title: saved.title, doc: saved.doc, revision: result.revision }
              : previous,
          );
        }
        void client.invalidateQueries({ queryKey: ["notes"] });
        void client.invalidateQueries({ queryKey: ["search"] });
        void client.invalidateQueries({ queryKey: queryKeys.links(result.id) });
      },
    };

    void saveManager.open(session).then(() => {
      if (cancelled || editor.isDestroyed) return;
      if (loadedIdRef.current === detail.id) return;
      loadedIdRef.current = detail.id;

      // `open` flushed the previous note, so the cache now holds the freshest
      // saved document. Prefer it over the render-time snapshot.
      const latest = client.getQueryData<NoteDetail>(queryKeys.note(detail.id)) ?? detail;
      applyNote(latest);

      const entry = journal.get(detail.id);
      const state = journal.status(entry, {
        revision: latest.revision,
        title: latest.title,
        doc: latest.doc,
      });
      if (state === "recoverable") {
        setRecovery(entry);
      } else {
        if (entry) journal.remove(detail.id);
        setRecovery(null);
      }

      // Recent notes are ordered by last opened time; this never bumps revision.
      void api
        .touchNote(detail.id)
        .then(() => client.invalidateQueries({ queryKey: ["notes"] }))
        .catch(() => undefined);
    });

    return () => {
      cancelled = true;
      void saveManager.flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, note.data?.id]);

  const editorReady = editor?.isInitialized ?? false;
  useEffect(() => {
    // `isInitialized` flips once Tiptap has created the ProseMirror view; until
    // then `view.dom` throws (which happens while StrictMode re-attaches effects).
    if (!editor || !editorReady || editor.isDestroyed) return;
    editor.view.dom.setAttribute("spellcheck", String(spellcheck));
  }, [editor, editorReady, spellcheck]);

  const applyJournal = () => {
    if (!editor || !recovery) return;
    loadingRef.current = true;
    editor.commands.setContent(recovery.doc, { emitUpdate: false });
    loadingRef.current = false;
    titleRef.current = recovery.title;
    setTitle(recovery.title);
    renameTab(noteId, recovery.title);
    setRecovery(null);
    saveManager.markDirty();
    toast.success("Draft restored", {
      description: "Save or continue editing to write it to the database.",
    });
  };

  const discardJournal = () => {
    journal.remove(noteId);
    setRecovery(null);
  };

  const reloadFromDisk = async () => {
    setResolving(true);
    try {
      const fresh = await api.getNote(noteId);
      client.setQueryData(queryKeys.note(noteId), fresh);
      saveManager.discardLocal(noteId);
      saveManager.adoptRevision(fresh.revision);
      journal.remove(noteId);
      setRecovery(null);
      applyNote(fresh);
      toast.success("Reloaded the saved version");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setResolving(false);
    }
  };

  const overwriteWithMine = async () => {
    setResolving(true);
    try {
      const fresh = await api.getNote(noteId);
      await saveManager.overwrite(fresh.revision);
      setResolving(false);
      toast.success("Your version was saved");
    } catch (error) {
      setResolving(false);
      toast.error(errorMessage(error));
    }
  };

  const commitTags = (names: string[]) => {
    tagMutation.mutate(
      { noteId, names },
      {
        onSuccess: (next) => setTags(next),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const addTags = () => {
    const incoming = tagDraft
      .split(",")
      .map((name) => name.trim().replace(/^#/, ""))
      .filter(Boolean);
    if (incoming.length === 0) return;
    const names = tags.map((tag) => tag.name);
    for (const name of incoming) {
      if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    }
    setTagDraft("");
    commitTags(names);
  };

  const insertNoteLink = (target: TitleSuggestion) => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: displayTitle(target.title),
        marks: [{ type: "link", attrs: { href: `note://${target.id}` } }],
      })
      .insertContent(" ")
      .run();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`note://${noteId}`);
      toast.success("Note link copied", {
        description: "Paste it into another note or the title search.",
      });
    } catch {
      toast.error("The clipboard is unavailable");
    }
  };

  const duplicateNote = async () => {
    try {
      await saveManager.flush();
      duplicate.mutate(noteId, {
        onSuccess: (copy) => {
          onOpenNote({ id: copy.id, title: copy.title });
          toast.success("Note duplicated");
        },
        onError: (error) => toast.error(errorMessage(error)),
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleTrash = async () => {
    try {
      await saveManager.flush();
      trash.mutate(noteId, {
        onSuccess: () => {
          closeTab(noteId);
          setTrashOpen(false);
          toast.success("Note moved to trash", {
            description: "Restore it from the Trash view if needed.",
          });
        },
        onError: (error) => toast.error(errorMessage(error)),
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    const target = event.target as HTMLElement;
    const toggle = target.closest<HTMLElement>(".fold-toggle");
    if (toggle?.dataset.foldId) {
      event.preventDefault();
      toggleFold(editor, toggle.dataset.foldId);
      return;
    }
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (href.startsWith("note://")) {
      event.preventDefault();
      const id = href.slice("note://".length);
      const label = anchor.textContent?.trim() || "Note";
      if (id) onOpenNote({ id, title: label });
      return;
    }
    if (/^https?:/i.test(href)) {
      event.preventDefault();
      void openUrl(href).catch((error: unknown) => toast.error(errorMessage(error)));
    }
  };

  if (note.isPending) {
    return (
      <div className="flex min-w-0 flex-1 flex-col bg-editor">
        <div className="flex h-10 items-center gap-2 border-b border-border/70 px-4">
          <div className="h-2.5 w-32 animate-pulse rounded bg-muted/60" />
          <div className="ml-auto h-2.5 w-20 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="mt-6 space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((row) => (
              <div
                key={row}
                className="h-3 animate-pulse rounded bg-muted/40"
                style={{ width: `${68 + ((row * 13) % 28)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (note.isError || !note.data) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-editor">
        <EmptyState
          icon={<FilePlus2 />}
          title="This note could not be opened"
          description={errorMessage(note.error)}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void note.refetch()}>
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={() => closeTab(noteId)}>
                Close tab
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const detail = note.data;
  const showStatus = statusNoteId === detail.id ? status : "idle";
  const editorWidth = settings.data?.editorWidth ?? 68;
  const backlinks = links.data?.backlinks ?? [];
  const outlinks = links.data?.outlinks ?? [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-editor">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{detail.folderPath || "No folder"}</span>
          <ChevronRight className="size-3 shrink-0 opacity-60" />
          <span className="truncate text-foreground/70">{displayTitle(title)}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <span className="mr-1 hidden text-[10.5px] text-muted-foreground/70 md:block">
            Edited {formatRelative(detail.updatedAt)}
          </span>
          <Tooltip label={detail.isFavorite ? "Remove from favorites" : "Add to favorites"}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={detail.isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={detail.isFavorite}
              className={cn(detail.isFavorite && "text-primary")}
              onClick={() =>
                favorite.mutate(
                  { id: noteId, favorite: !detail.isFavorite },
                  {
                    onSuccess: () =>
                      void client.invalidateQueries({ queryKey: queryKeys.note(noteId) }),
                    onError: (error) => toast.error(errorMessage(error)),
                  },
                )
              }
            >
              <Star className={cn(detail.isFavorite && "fill-primary/30")} />
            </Button>
          </Tooltip>
          <Tooltip label="Copy note link">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy note link"
              onClick={() => void copyLink()}
            >
              <Link2 />
            </Button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Note actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                <Sparkles />
                Save as template…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void duplicateNote()}>
                <Copy />
                Duplicate note
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <Link2 />
                Copy note link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  if (settings.data?.confirmDelete === false) void handleTrash();
                  else setTrashOpen(true);
                }}
              >
                <Trash2 />
                Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <EditorToolbar editor={editor} onInsertNoteLink={() => setNoteLinkOpen(true)} />

      {showStatus === "conflict" ? (
        <Banner
          tone="warning"
          icon={<AlertTriangle />}
          title="This note changed elsewhere"
          body="Another save (or a list rename) wrote a newer revision. Choose which version wins: your draft stays in the recovery journal until you decide."
          actions={
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={resolving}
                onClick={() => void reloadFromDisk()}
              >
                <RotateCcw />
                Reload saved version
              </Button>
              <Button size="xs" disabled={resolving} onClick={() => void overwriteWithMine()}>
                <Save />
                Keep my version
              </Button>
            </>
          }
        />
      ) : null}

      {showStatus === "error" && saveError ? (
        <Banner
          tone="danger"
          icon={<AlertTriangle />}
          title="Autosave failed"
          body={saveError}
          actions={
            <>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  void saveManager.retry().catch((error: unknown) => toast.error(errorMessage(error)))
                }
              >
                <RotateCcw />
                Retry
              </Button>
              <Button size="xs" variant="ghost" onClick={() => void copyLink()}>
                <Copy />
                Copy note link
              </Button>
            </>
          }
        />
      ) : null}

      {recovery ? (
        <Banner
          tone="info"
          icon={<History />}
          title="An unsaved draft was recovered"
          body={`A local journal copy from ${formatRelative(
            new Date(recovery.savedAt).toISOString(),
          )} matches this note's last revision. Restore it if the app closed before saving.`}
          actions={
            <>
              <Button size="xs" onClick={applyJournal}>
                <History />
                Restore draft
              </Button>
              <Button size="xs" variant="ghost" onClick={discardJournal}>
                Discard
              </Button>
            </>
          }
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div
          className="scrollbar-none min-w-0 flex-1 overflow-y-auto"
          onClick={handleEditorClick}
        >
          <div
            className="mx-auto flex w-full flex-col px-8 pb-16 pt-8"
            style={{ maxWidth: `calc(${editorWidth}ch + 4rem)` }}
          >
            <input
              value={title}
              onChange={(event) => {
                const next = event.target.value;
                setTitle(next);
                titleRef.current = next;
                renameTab(noteId, next);
                saveManager.markDirty(delayRef.current);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  editor.chain().focus("start").run();
                }
              }}
              placeholder="Untitled note"
              aria-label="Note title"
              maxLength={200}
              spellCheck={false}
              className="w-full border-0 bg-transparent p-0 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-foreground outline-none placeholder:text-muted-foreground/35"
            />

            <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="group/tag inline-flex h-[21px] items-center gap-1 rounded-full border border-border/70 bg-surface/70 pl-1.5 pr-1 text-[10.5px] text-muted-foreground"
                >
                  <Tag className="size-2.5 opacity-70" />#{tag.name}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag.name}`}
                    disabled={tagMutation.isPending}
                    className="flex size-3.5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
                    onClick={() => commitTags(tags.filter((item) => item.id !== tag.id).map((item) => item.name))}
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
              <Input
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTags();
                  } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
                    const last = tags[tags.length - 1];
                    if (last) {
                      commitTags(
                        tags.filter((item) => item.id !== last.id).map((item) => item.name),
                      );
                    }
                  }
                }}
                onBlur={() => {
                  if (tagDraft.trim()) addTags();
                }}
                disabled={tagMutation.isPending}
                placeholder={tags.length === 0 ? "Add tags…" : "Add tag"}
                aria-label="Add a tag"
                className="h-[21px] w-24 border-0 bg-transparent px-1 text-[11px] shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
                spellCheck={false}
              />
            </div>

            <Separator className="mt-4" />

            <div className="mt-5">
              <EditorContent editor={editor} className="editor-surface" />
            </div>

            {backlinks.length > 0 || outlinks.length > 0 ? (
              <div className="mt-14">
                <div className="flex items-center gap-2">
                  <SectionLabel className="!h-6 px-0">Note links</SectionLabel>
                  <span className="text-[10.5px] text-muted-foreground/70">
                    {pluralize(backlinks.length, "backlink")} · {pluralize(outlinks.length, "outlink")}
                  </span>
                </div>
                {backlinks.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    {backlinks.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => onOpenNote({ id: link.id, title: link.title })}
                        className="group flex w-full items-center gap-2 rounded-md border border-border/60 bg-surface/40 px-2.5 py-1.5 text-left transition-colors hover:border-primary/30 hover:bg-surface-raised"
                      >
                        <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
                        <span className="min-w-0 flex-1 truncate text-ui-sm">
                          {displayTitle(link.title)}
                        </span>
                        <span className="shrink-0 truncate text-[10.5px] text-muted-foreground/70">
                          {link.folderPath || "No folder"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">
                    No other note links here yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {outlineOpen ? <OutlinePanel editor={editor} /> : null}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 px-3 text-[10.5px] text-muted-foreground/75">
        <span className="flex items-center gap-1.5">
          <SaveStateDot status={showStatus} />
          {saveStatusLabel(showStatus)}
          {showStatus === "saved" && lastSavedAt ? (
            <span className="text-muted-foreground/55">
              · {formatRelative(new Date(lastSavedAt).toISOString())}
            </span>
          ) : null}
        </span>
        <span className="tabular">{pluralize(view?.words ?? 0, "word")}</span>
        <span className="hidden tabular sm:inline">
          {pluralize(view?.characters ?? 0, "character")}
        </span>
        {view && view.foldedCount > 0 ? (
          <span className="hidden items-center gap-1 md:flex">
            <ChevronRight className="size-3" />
            {pluralize(view.foldedCount, "folded section")}
          </span>
        ) : null}
        <span className="ml-auto hidden items-center gap-1 lg:flex">
          <Kbd>[[</Kbd>
          link a note
        </span>
      </footer>

      <BubbleMenu
        editor={editor}
        updateDelay={120}
        options={{ placement: "top" }}
        shouldShow={({ editor: current, from, to }) =>
          from !== to && !current.isActive("codeBlock") && !current.isActive("table")
        }
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-overlay"
      >
        <BubbleMenuContent editor={editor} onLink={() => setNoteLinkOpen(true)} />
      </BubbleMenu>

      <NoteLinkDialog
        open={noteLinkOpen}
        onOpenChange={setNoteLinkOpen}
        onPick={insertNoteLink}
      />

      <NameDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title="Save note as template"
        description="The template stores the note's current structure. Later notes created from it are independent copies."
        label="Template name"
        initialValue={displayTitle(title)}
        submitLabel="Save template"
        pending={saveAsTemplate.isPending}
        onSubmit={(name) => {
          saveAsTemplate.mutate(
            { noteId, name },
            {
              onSuccess: () => {
                setTemplateOpen(false);
                toast.success("Template saved");
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          );
        }}
      />

      <ConfirmDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title={`Move “${displayTitle(title)}” to trash?`}
        description="The note disappears from lists and search. It can be restored from Trash until you empty it."
        confirmLabel="Move to trash"
        destructive
        pending={trash.isPending}
        onConfirm={() => void handleTrash()}
      />
    </div>
  );
}

function SaveStateDot({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <Loader2 className="size-3 animate-spin text-primary/80" />;
  }
  if (status === "conflict" || status === "error") {
    return <AlertTriangle className="size-3 text-warning" />;
  }
  if (status === "dirty") {
    return <Pencil className="size-3 text-muted-foreground" />;
  }
  if (status === "saved") {
    return <Check className="size-3 text-success" />;
  }
  return <span className="size-1.5 rounded-full bg-muted-foreground/40" />;
}

function Banner({
  tone,
  icon,
  title,
  body,
  actions,
}: {
  tone: "warning" | "danger" | "info";
  icon: ReactNode;
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-b px-4 py-2",
        tone === "warning" && "border-warning/25 bg-warning/8",
        tone === "danger" && "border-destructive/25 bg-destructive/8",
        tone === "info" && "border-info/25 bg-info/8",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border [&_svg]:size-3.5",
          tone === "warning" && "border-warning/30 text-warning",
          tone === "danger" && "border-destructive/30 text-destructive",
          tone === "info" && "border-info/30 text-info",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui-sm font-medium">{title}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{body}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div> : null}
    </div>
  );
}

function BubbleMenuContent({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      underline: current.isActive("underline"),
      strike: current.isActive("strike"),
      highlight: current.isActive("highlight"),
      code: current.isActive("code"),
      link: current.isActive("link"),
    }),
  });

  return (
    <>
      <BubbleButton
        label="Bold"
        active={state?.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </BubbleButton>
      <BubbleButton
        label="Italic"
        active={state?.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </BubbleButton>
      <BubbleButton
        label="Underline"
        active={state?.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </BubbleButton>
      <BubbleButton
        label="Strikethrough"
        active={state?.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </BubbleButton>
      <BubbleButton
        label="Highlight"
        active={state?.highlight}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter />
      </BubbleButton>
      <BubbleButton
        label="Inline code"
        active={state?.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code />
      </BubbleButton>
      <BubbleButton label="Link to a note" active={state?.link} onClick={onLink}>
        <Link2 />
      </BubbleButton>
    </>
  );
}

function BubbleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "text-muted-foreground hover:text-foreground [&_svg]:size-3.5",
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
