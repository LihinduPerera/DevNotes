import { AppShell } from "./AppShell";
import { DesktopRequired } from "./DesktopRequired";
import { ErrorBoundary } from "./ErrorBoundary";
import { Providers } from "./providers";
import { isDesktopShell } from "@/lib/ipc";

export function App() {
  if (!isDesktopShell()) return <DesktopRequired />;

  return (
    <ErrorBoundary>
      <Providers>
        <AppShell />
      </Providers>
    </ErrorBoundary>
  );
}
