import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Database,
  Download,
  FolderOpen,
  Info,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings2,
  Sun,
  Upload,
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, Switch } from "@/components/ui/controls";
import { Badge, Separator } from "@/components/ui/primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { api } from "@/lib/ipc";
import {
  queryKeys,
  useAppInfo,
  useIndexStats,
  useResetSettings,
  useSettings,
  useUpdateSetting,
} from "@/lib/queries";
import { setThemeMode, useThemeMode } from "@/lib/theme";
import type { AppSettings, BackupInfo, ThemeMode } from "@/lib/types";
import { cn, errorMessage, formatBytes, pluralize } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";

type SectionId = "editor" | "appearance" | "data" | "about";

const SECTIONS: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: "editor", label: "Editor", icon: <Settings2 /> },
  { id: "appearance", label: "Appearance", icon: <Palette /> },
  { id: "data", label: "Data & backups", icon: <Database /> },
  { id: "about", label: "About", icon: <Info /> },
];

export function SettingsDialog({
  open: isOpen,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [section, setSection] = useState<SectionId>("editor");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[560px] max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Everything here is stored locally. Changes apply immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav className="w-44 shrink-0 border-r border-border bg-surface/40 p-2">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm transition-colors [&_svg]:size-3.5 [&_svg]:text-muted-foreground",
                  section === item.id
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="scrollbar-none min-w-0 flex-1 overflow-y-auto p-5">
            {section === "editor" ? <EditorSettings /> : null}
            {section === "appearance" ? <AppearanceSettings /> : null}
            {section === "data" ? <DataSettings /> : null}
            {section === "about" ? <AboutSettings /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditorSettings() {
  const settings = useSettings();
  const update = useUpdateSetting();
  const outlineOpen = useWorkspace((state) => state.outlineOpen);
  const setOutlineOpen = useWorkspace((state) => state.setOutlineOpen);
  const sidebarCollapsed = useWorkspace((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspace((state) => state.toggleSidebar);

  const set = (key: keyof AppSettings, value: unknown) =>
    update.mutate(
      { key, value },
      { onError: (error) => toast.error(errorMessage(error)) },
    );

  if (settings.isPending) return <SettingsSkeleton />;

  const data = settings.data;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Writing"
        description="Autosave keeps a recovery copy in local storage between debounced database writes."
      />

      <SettingRow
        title="Autosave"
        description="Save changes automatically after a short pause in typing."
      >
        <Switch
          checked={data?.autosaveEnabled ?? true}
          onCheckedChange={(checked) => set("autosaveEnabled", checked)}
          aria-label="Autosave"
        />
      </SettingRow>

      <SettingRow
        title="Autosave delay"
        description="How long to wait after the last keystroke."
      >
        <Select
          value={String(data?.autosaveDelayMs ?? 800)}
          onValueChange={(value) => set("autosaveDelayMs", Number(value))}
          disabled={data?.autosaveEnabled === false}
        >
          <SelectTrigger className="w-32" aria-label="Autosave delay">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="400">0.4 seconds</SelectItem>
            <SelectItem value="800">0.8 seconds</SelectItem>
            <SelectItem value="1500">1.5 seconds</SelectItem>
            <SelectItem value="3000">3 seconds</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="Editor width"
        description="Comfortable measure for the writing column."
      >
        <Select
          value={String(data?.editorWidth ?? 68)}
          onValueChange={(value) => set("editorWidth", Number(value))}
        >
          <SelectTrigger className="w-32" aria-label="Editor width">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="54">Narrow · 54ch</SelectItem>
            <SelectItem value="60">60ch</SelectItem>
            <SelectItem value="68">Default · 68ch</SelectItem>
            <SelectItem value="76">Wide · 76ch</SelectItem>
            <SelectItem value="84">Extra wide · 84ch</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        title="Spellcheck"
        description="Use the operating system spellchecker in the editor."
      >
        <Switch
          checked={data?.spellcheck ?? true}
          onCheckedChange={(checked) => set("spellcheck", checked)}
          aria-label="Spellcheck"
        />
      </SettingRow>

      <Separator />

      <SectionTitle
        title="Workspace"
        description="Layout preferences are remembered per installation."
      />

      <SettingRow
        title="Show outline panel"
        description="Mirror the document headings in a right-hand rail."
      >
        <Switch
          checked={outlineOpen}
          onCheckedChange={setOutlineOpen}
          aria-label="Show outline panel"
        />
      </SettingRow>

      <SettingRow
        title="Collapse sidebar"
        description="Give the note list and editor more room."
      >
        <Switch
          checked={sidebarCollapsed}
          onCheckedChange={toggleSidebar}
          aria-label="Collapse sidebar"
        />
      </SettingRow>

      <SettingRow
        title="Confirm before deleting"
        description="Ask before moving notes to trash or deleting a folder."
      >
        <Switch
          checked={data?.confirmDelete ?? true}
          onCheckedChange={(checked) => set("confirmDelete", checked)}
          aria-label="Confirm before deleting"
        />
      </SettingRow>
    </div>
  );
}

function AppearanceSettings() {
  const mode = useThemeMode();

  const options: Array<{ id: ThemeMode; label: string; icon: ReactNode }> = [
    { id: "dark", label: "Graphite", icon: <Moon /> },
    { id: "light", label: "Paper", icon: <Sun /> },
    { id: "system", label: "System", icon: <Monitor /> },
  ];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Theme"
        description="Both themes share the same layout and contrast targets. System follows the operating system setting."
      />
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setThemeMode(option.id)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
              mode === option.id
                ? "border-primary/50 bg-primary/8 ring-1 ring-primary/30"
                : "border-border hover:border-border/80 hover:bg-accent/40",
            )}
          >
            <span className="flex items-center gap-2 text-ui-sm font-medium [&_svg]:size-3.5">
              {option.icon}
              {option.label}
            </span>
            <span
              className={cn(
                "mt-2.5 block h-12 rounded-md border",
                option.id === "dark"
                  ? "border-white/10 bg-[oklch(0.158_0.006_80)]"
                  : option.id === "light"
                    ? "border-black/10 bg-[oklch(0.982_0.005_85)]"
                    : "border-border bg-[linear-gradient(110deg,oklch(0.982_0.005_85)_0_50%,oklch(0.158_0.006_80)_50%_100%)]",
              )}
            >
              <span
                className={cn(
                  "mx-2 mt-2 block h-1.5 w-8 rounded-full",
                  option.id === "light"
                    ? "bg-[oklch(0.54_0.115_55)]"
                    : "bg-[oklch(0.76_0.095_62)]",
                )}
              />
              <span
                className={cn(
                  "mx-2 mt-1.5 block h-1 w-14 rounded-full",
                  option.id === "light" ? "bg-black/15" : "bg-white/20",
                )}
              />
              <span
                className={cn(
                  "mx-2 mt-1 block h-1 w-10 rounded-full",
                  option.id === "light" ? "bg-black/10" : "bg-white/10",
                )}
              />
            </span>
            {mode === option.id ? (
              <Badge className="mt-2" variant="outline">
                Active
              </Badge>
            ) : (
              <span className="mt-2 block h-[18px]" />
            )}
          </button>
        ))}
      </div>

      <p className="rounded-md border border-border/70 bg-surface/50 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
        The accent colour is copper in both themes. The dark theme uses graphite
        surfaces to keep the writing area calm; the light theme uses a warm paper
        tone rather than pure white.
      </p>
    </div>
  );
}

function DataSettings() {
  const client = useQueryClient();
  const [busy, setBusy] = useState<"export" | "rebuild" | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupInfo | null>(null);
  const [restorePending, setRestorePending] = useState(false);

  const exportBackup = async () => {
    try {
      const destination = await save({
        title: "Export UnrealNotes backup",
        defaultPath: `unrealnotes-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!destination) return;
      setBusy("export");
      const info = await api.exportBackup(destination);
      toast.success("Backup exported and verified", {
        description: `${pluralize(info.notes, "note")} · ${formatBytes(info.sizeBytes)}`,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const inspectRestore = async () => {
    try {
      const selected = await open({
        title: "Choose an UnrealNotes backup",
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite database", extensions: ["db"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const info = await api.inspectBackup(selected);
      setPendingRestore(info);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const rebuild = async () => {
    setBusy("rebuild");
    try {
      const count = await api.rebuildSearchIndex();
      void client.invalidateQueries({ queryKey: queryKeys.indexStats });
      void client.invalidateQueries({ queryKey: ["search"] });
      toast.success(`Search index rebuilt (${pluralize(count, "note")})`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionTitle
          title="Backups"
          description="Exports use SQLite's VACUUM INTO and are re-opened read-only for an integrity check before they are offered as valid."
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void exportBackup()} disabled={busy !== null}>
            <Download />
            {busy === "export" ? "Exporting…" : "Export backup"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void inspectRestore()}
            disabled={busy !== null || restorePending}
          >
            <Upload />
            Restore backup…
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
          Restoring validates the file, snapshots the current database, replaces
          it, and restarts the application. Attachments are not part of the
          database backup and should be copied separately if needed.
        </p>
      </div>

      <Separator />

      <div>
        <SectionTitle
          title="Search index"
          description="FTS5 is updated inside the same transaction as every save. Rebuild only if search looks out of date."
        />
        <IndexStats />
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => void rebuild()}
          disabled={busy !== null}
        >
          <RefreshCw className={busy === "rebuild" ? "animate-spin" : undefined} />
          {busy === "rebuild" ? "Rebuilding…" : "Rebuild index"}
        </Button>
      </div>

      <Separator />

      <div>
        <SectionTitle
          title="Storage"
          description="Open the app data directory to inspect the database, attachments, backups, and logs."
        />
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() =>
            void api.openDataDir().catch((error: unknown) => toast.error(errorMessage(error)))
          }
        >
          <FolderOpen />
          Open data folder
        </Button>
      </div>

      <Separator />

      <ResetSettings />

      <ConfirmDialog
        open={pendingRestore !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRestore(null);
        }}
        title="Restore this backup?"
        description={
          pendingRestore
            ? `This backup contains ${pluralize(pendingRestore.notes, "note")}, ${pluralize(pendingRestore.folders, "folder")}, and ${pluralize(pendingRestore.tags, "tag")} (${formatBytes(pendingRestore.sizeBytes)}). The current database is snapshotted first, then replaced, and the app restarts.`
            : ""
        }
        confirmLabel="Restore and restart"
        destructive
        pending={restorePending}
        onConfirm={() => {
          if (!pendingRestore) return;
          setRestorePending(true);
          toast.info("Restoring backup…", {
            description: "The window will restart when the database is replaced.",
          });
          api
            .restoreBackup(pendingRestore.path)
            .catch((error: unknown) => {
              toast.error(errorMessage(error));
              setRestorePending(false);
              setPendingRestore(null);
            });
        }}
      />
    </div>
  );
}

function IndexStats() {
  const stats = useIndexStats();
  if (stats.isPending) {
    return <div className="mt-2 h-4 w-40 animate-pulse rounded bg-muted/60" />;
  }
  if (stats.isError || !stats.data) {
    return <p className="mt-2 text-[11px] text-muted-foreground">Index stats unavailable.</p>;
  }
  const data = stats.data;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <Badge variant={data.inSync ? "success" : "warning"}>
        {data.inSync ? "In sync" : "Out of sync"}
      </Badge>
      <span>
        {pluralize(data.indexedNotes, "indexed note")} · {pluralize(data.activeNotes, "active note")} ·{" "}
        {pluralize(data.totalNotes, "total note")}
      </span>
    </div>
  );
}

function ResetSettings() {
  const reset = useResetSettings();
  const [confirming, setConfirming] = useState(false);

  return (
    <div>
      <SectionTitle
        title="Reset settings"
        description="Restores editor and behaviour settings to their defaults. Notes, folders, tags, and backups are untouched."
      />
      <Button
        size="sm"
        variant="outline"
        className="mt-1 text-muted-foreground hover:text-foreground"
        onClick={() => setConfirming(true)}
      >
        <RefreshCw />
        Reset to defaults
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset all settings?"
        description="Editor width, autosave, spellcheck, and delete confirmation return to their defaults. Content is not affected."
        confirmLabel="Reset settings"
        pending={reset.isPending}
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              toast.success("Settings reset");
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </div>
  );
}

function AboutSettings() {
  const info = useAppInfo();

  if (info.isPending) return <SettingsSkeleton />;
  if (info.isError || !info.data) {
    return (
      <p className="text-ui-sm text-muted-foreground">
        Application information is unavailable.
      </p>
    );
  }

  const data = info.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
          <Database className="size-5" />
        </div>
        <div>
          <p className="text-[15px] font-semibold">UnrealNotes</p>
          <p className="text-ui-xs text-muted-foreground">
            Version {data.version} · {data.platform}
          </p>
        </div>
      </div>

      <p className="text-ui-sm leading-relaxed text-muted-foreground">
        A local-first notebook for game development knowledge. No accounts, no
        sync, no network calls. Every note lives in a SQLite database on this
        machine.
      </p>

      <div className="space-y-2 rounded-lg border border-border/70 bg-surface/40 p-3">
        <PathRow label="Data directory" value={data.dataDir} />
        <PathRow label="Database" value={data.dbPath} />
        <PathRow label="Attachments" value={data.attachmentsDir} />
        <PathRow label="Backups" value={data.backupsDir} />
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/8 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          Never move or delete the database while the app is running. Use the
          backup tools instead; restores create a safety snapshot automatically.
        </span>
      </div>
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </p>
      <p className="mt-0.5 break-all font-mono text-[10.5px] leading-snug text-foreground/80">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold tracking-[-0.005em]">{title}</h2>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <Label className="text-ui-sm font-medium">{title}</Label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2 border-b border-border/50 pb-3">
          <div className="h-3 w-32 animate-pulse rounded bg-muted/70" />
          <div className="h-2.5 w-64 animate-pulse rounded bg-muted/50" />
        </div>
      ))}
    </div>
  );
}
