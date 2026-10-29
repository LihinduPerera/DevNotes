import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useThemeMode } from "@/lib/theme";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

const queryClient = createQueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const theme = useThemeMode();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={350} skipDelayDuration={120}>
        {children}
        <Toaster
          theme={theme === "light" ? "light" : "dark"}
          position="bottom-right"
          closeButton
          richColors={false}
          toastOptions={{
            classNames: {
              toast:
                "!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-overlay !text-ui-sm",
              description: "!text-muted-foreground",
              actionButton: "!bg-primary !text-primary-foreground",
              cancelButton: "!bg-secondary !text-secondary-foreground",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
