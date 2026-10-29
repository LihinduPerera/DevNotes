import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge, Kbd, Spinner } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { useSearchNotes } from "@/lib/queries";
import { cn, displayTitle, formatRelative } from "@/lib/utils";

interface SnippetSegment {
  text: string;
  mark: boolean;
}

/**
 * FTS5 returns char(1)/char(2) around matches; rendering them as <mark>
 * keeps user text (including literal brackets) completely untouched.
 */
function parseSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  let buffer = "";
  let mark = false;
  for (const char of snippet) {
    const code = char.charCodeAt(0);
    if (code === 1 || code === 2) {
      if (buffer) {
        segments.push({ text: buffer, mark });
        buffer = "";
      }
      mark = code === 1;
      continue;
    }
    buffer += char;
  }
  if (buffer) segments.push({ text: buffer, mark });
  return segments;
}

function HighlightedSnippet({ snippet }: { snippet: string }) {
  const segments = useMemo(() => parseSnippet(snippet), [snippet]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.mark ? (
          <mark key={index} className="search-mark">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenNote: (note: { id: string; title: string }) => void;
}

export function SearchPalette({ open, onOpenChange, onOpenNote }: SearchPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" hideClose>
        {open ? <SearchPaletteBody onOpenChange={onOpenChange} onOpenNote={onOpenNote} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SearchPaletteBody({
  onOpenChange,
  onOpenNote,
}: Omit<SearchPaletteProps, "open">) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const results = useSearchNotes(query);
  const hits = useMemo(() => results.data ?? [], [results.data]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const hit = hits[selected];
    if (!hit) return;
    rowRefs.current.get(hit.id)?.scrollIntoView({ block: "nearest" });
  }, [selected, hits]);

  const choose = (id: string, title: string) => {
    onOpenNote({ id, title: displayTitle(title) });
    onOpenChange(false);
  };

  const trimmed = query.trim();

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>Search notes</DialogTitle>
        <DialogDescription>
          Full-text search across titles, note bodies, folders, and tags.
        </DialogDescription>
      </DialogHeader>

      <div className="flex h-12 items-center gap-2.5 border-b border-border px-3.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
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
              setSelected((current) => (hits.length === 0 ? 0 : (current + 1) % hits.length));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) =>
                hits.length === 0 ? 0 : (current - 1 + hits.length) % hits.length,
              );
            } else if (event.key === "Enter") {
              const hit = hits[selected];
              if (hit) {
                event.preventDefault();
                choose(hit.id, hit.title);
              }
            }
          }}
          placeholder="Search notes, folders, tags…"
          aria-label="Search query"
          className="h-8 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
        />
        {results.isFetching && trimmed ? <Spinner className="size-3.5" /> : <Kbd>Esc</Kbd>}
      </div>

      <div className="scrollbar-none max-h-[58vh] min-h-[120px] overflow-y-auto p-1.5">
        {!trimmed ? (
          <div className="px-2.5 py-8 text-center">
            <p className="text-ui-sm text-muted-foreground">
              Search titles, body text, folder paths, and tags.
            </p>
            <p className="mt-1.5 text-ui-xs text-muted-foreground/70">
              Full-text search is indexed locally with SQLite FTS5.
            </p>
          </div>
        ) : results.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-ui-sm text-muted-foreground">
            <Spinner /> Searching…
          </div>
        ) : results.isError ? (
          <p className="px-3 py-8 text-center text-ui-sm text-destructive">
            Search could not be completed. Check the query and try again.
          </p>
        ) : hits.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-ui-sm text-muted-foreground">No notes match “{trimmed}”.</p>
            <p className="mt-1 text-ui-xs text-muted-foreground/70">
              Search matches whole words after normalisation.
            </p>
          </div>
        ) : (
          <div role="listbox" aria-label="Search results" className="space-y-0.5">
            {hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={index === selected}
                ref={(element) => {
                  if (element) rowRefs.current.set(hit.id, element);
                  else rowRefs.current.delete(hit.id);
                }}
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(hit.id, hit.title)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  index === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border border-border/70 bg-surface text-muted-foreground">
                  <FileText className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-ui-sm font-medium">
                      {displayTitle(hit.title)}
                    </span>
                    {hit.folderPath ? (
                      <span className="shrink-0 truncate text-[10.5px] text-muted-foreground/80">
                        {hit.folderPath}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                      {formatRelative(hit.updatedAt)}
                    </span>
                  </span>
                  {hit.snippet.trim() ? (
                    <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-muted-foreground">
                      <HighlightedSnippet snippet={hit.snippet} />
                    </span>
                  ) : (
                    <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-muted-foreground/70">
                      {hit.excerpt.trim() || "No content"}
                    </span>
                  )}
                  {hit.tags.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {hit.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag.id} variant="secondary" className="px-1 py-0 text-[9.5px]">
                          #{tag.name}
                        </Badge>
                      ))}
                    </span>
                  ) : null}
                </span>
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
          Open
        </span>
        <span className="ml-auto">
          {trimmed && !results.isPending
            ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
            : ""}
        </span>
      </div>
    </>
  );
}
