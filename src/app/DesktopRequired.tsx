import { BookOpen, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when the Vite dev server is opened in a normal browser. Every data path
 * goes through Tauri IPC, so we fail closed instead of showing an empty shell.
 */
export function DesktopRequired() {
  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-panel">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <span className="font-semibold tracking-[-0.01em]">UnrealNotes</span>
        </div>
        <h1 className="text-[15px] font-semibold">Desktop shell required</h1>
        <p className="mt-2 text-ui-sm leading-relaxed text-muted-foreground">
          This window is running in a plain browser, where the local database and file
          system are unavailable. Start the desktop app with{" "}
          <code className="rounded border border-border bg-code px-1 py-0.5 font-mono text-[11px]">
            pnpm tauri dev
          </code>{" "}
          to work with your notes.
        </p>
        <div className="mt-5 flex items-center gap-2 text-ui-xs text-muted-foreground">
          <MonitorDown className="size-3.5" />
          Notes stay on this machine, in the app data directory.
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
