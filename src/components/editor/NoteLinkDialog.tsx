import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/ipc";
import type { TitleSuggestion } from "@/lib/types";
import { cn, displayTitle } from "@/lib/utils";

interface NoteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (note: TitleSuggestion) => void;
}

export function NoteLinkDialog({ open, onOpenChange, onPick }: NoteLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" hideClose>
        {open ? <NoteLinkPicker onOpenChange={onOpenChange} onPick={onPick} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NoteLinkPicker({
  onOpenChange,
  onPick,
}: Omit<NoteLinkDialogProps, "open">) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useQuery({
    queryKey: ["note-suggestions", query],
    queryFn: () => api.suggestNotes(query, 20),
    staleTime: 5_000,
  });

  const items = suggestions.data ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, []);

  const pick = (note: TitleSuggestion) => {
    onPick(note);
    onOpenChange(false);
  };

  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>Link to a note</DialogTitle>
        <DialogDescription>
          Insert an internal link that opens another note in a new tab.
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
              setSelected((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) =>
                items.length === 0 ? 0 : (current - 1 + items.length) % items.length,
              );
            } else if (event.key === "Enter") {
              const item = items[selected];
              if (item) {
                event.preventDefault();
                pick(item);
              }
            }
          }}
          placeholder="Find a note by title…"
          aria-label="Note title"
          className="h-8 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="scrollbar-none max-h-[50vh] min-h-[100px] overflow-y-auto p-1.5">
        {suggestions.isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-ui-sm text-muted-foreground">
            <Spinner /> Looking up notes…
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-ui-sm text-muted-foreground">
            {query.trim() ? `No note title matches “${query.trim()}”.` : "No other notes yet."}
          </p>
        ) : (
          <div role="listbox" aria-label="Notes" className="space-y-0.5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
                onClick={() => pick(item)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-ui-sm transition-colors",
                  index === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{displayTitle(item.title)}</span>
                <Kbd>↵</Kbd>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
