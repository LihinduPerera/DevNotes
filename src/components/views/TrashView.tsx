import { useState } from "react";
import { ArchiveRestore, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge, EmptyState, Spinner } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import {
  useEmptyTrash,
  useNotes,
  usePurgeNote,
  useRestoreNote,
} from "@/lib/queries";
import type { NoteSummary } from "@/lib/types";
import { displayTitle, errorMessage, formatDateTime, pluralize } from "@/lib/utils";

/**
 * Trash is a dedicated view rather than a filter on the note list: deleted
 * notes must never become editable again without an explicit restore.
 */
export function TrashView() {
  const notes = useNotes({ trashed: true });
  const restore = useRestoreNote();
  const purge = usePurgeNote();
  const empty = useEmptyTrash();

  const [purgeTarget, setPurgeTarget] = useState<NoteSummary | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const rows = notes.data ?? [];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground">
          <Trash2 className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-ui-sm font-semibold">Trash</p>
          <p className="text-[10.5px] text-muted-foreground">
            {notes.isPending ? "Loading…" : pluralize(rows.length, "deleted note")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={rows.length === 0 || empty.isPending}
          onClick={() => setEmptyOpen(true)}
        >
          <Trash2 />
          Empty trash
        </Button>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-4">
        {notes.isPending ? (
          <div className="flex h-40 items-center justify-center gap-2 text-ui-sm text-muted-foreground">
            <Spinner /> Loading deleted notes…
          </div>
        ) : notes.isError ? (
          <EmptyState
            title="Could not load the trash"
            description={errorMessage(notes.error)}
            action={
              <Button size="sm" variant="outline" onClick={() => void notes.refetch()}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Trash2 />}
            title="Trash is empty"
            description="Notes you move to trash stay here until you restore or permanently delete them."
            className="py-24"
          />
        ) : (
          <div className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-border bg-surface/40">
            <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              <span className="min-w-0 flex-1">Note</span>
              <span className="hidden w-40 shrink-0 md:block">Original folder</span>
              <span className="hidden w-36 shrink-0 text-right sm:block">Deleted</span>
              <span className="w-[124px] shrink-0" />
            </div>
            <div className="divide-y divide-border/60">
              {rows.map((note) => (
                <div
                  key={note.id}
                  className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-raised/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui-sm font-medium text-foreground/90">
                      {displayTitle(note.title)}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                      {note.excerpt.trim() || "No content"}
                    </p>
                  </div>
                  <div className="hidden w-40 shrink-0 items-center gap-1 md:flex">
                    <span className="truncate text-ui-xs text-muted-foreground">
                      {note.trashedFromFolderPath || "No folder"}
                    </span>
                  </div>
                  <div className="hidden w-36 shrink-0 text-right text-ui-xs text-muted-foreground sm:block">
                    {formatDateTime(note.deletedAt)}
                  </div>
                  <div className="flex w-[124px] shrink-0 items-center justify-end gap-1">
                    <Tooltip label="Restore note">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={restore.isPending}
                        onClick={() =>
                          restore.mutate(note.id, {
                            onSuccess: () =>
                              toast.success("Note restored", {
                                description: note.trashedFromFolderPath
                                  ? `Returned to ${note.trashedFromFolderPath}.`
                                  : "Returned to the top level.",
                              }),
                            onError: (error) => toast.error(errorMessage(error)),
                          })
                        }
                      >
                        <Undo2 />
                        Restore
                      </Button>
                    </Tooltip>
                    <Tooltip label="Delete permanently">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${displayTitle(note.title)} permanently`}
                        onClick={() => setPurgeTarget(note)}
                      >
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rows.some((note) => note.tags.length > 0) ? (
          <p className="mx-auto mt-4 flex max-w-4xl flex-wrap gap-1 text-[10.5px] text-muted-foreground">
            {rows
              .flatMap((note) => note.tags)
              .slice(0, 12)
              .map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-[9.5px]">
                  #{tag.name}
                </Badge>
              ))}
          </p>
        ) : null}

        <p className="mx-auto mt-6 flex max-w-4xl items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <ArchiveRestore className="size-3.5" />
          Restoring returns a note to its original folder when that folder still exists.
        </p>
      </div>

      <ConfirmDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null);
        }}
        title={`Delete “${displayTitle(purgeTarget?.title)}” forever?`}
        description="This removes the note, its tags, its search index entry, and any attached files. It cannot be undone."
        confirmLabel="Delete forever"
        destructive
        pending={purge.isPending}
        onConfirm={() => {
          if (!purgeTarget) return;
          purge.mutate(purgeTarget.id, {
            onSuccess: () => {
              setPurgeTarget(null);
              toast.success("Note permanently deleted");
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />

      <ConfirmDialog
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        title="Empty the trash?"
        description={`${pluralize(rows.length, "note")} will be permanently deleted, including attachments. This cannot be undone.`}
        confirmLabel="Empty trash"
        destructive
        pending={empty.isPending}
        onConfirm={() => {
          empty.mutate(undefined, {
            onSuccess: (count) => {
              setEmptyOpen(false);
              toast.success(`${pluralize(count, "note")} permanently deleted`);
            },
            onError: (error) => toast.error(errorMessage(error)),
          });
        }}
      />
    </div>
  );
}
