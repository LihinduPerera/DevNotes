import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-panel">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" />
          </div>
          <h1 className="text-[15px] font-semibold">Something broke in the interface</h1>
          <p className="mt-1.5 text-ui-sm leading-relaxed text-muted-foreground">
            Your notes are stored locally and were not affected. Reload the window to
            continue; anything unsaved is kept in the recovery journal.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-border bg-code p-2 font-mono text-[11px] text-muted-foreground">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Dismiss
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload window
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
