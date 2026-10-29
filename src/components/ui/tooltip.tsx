import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[80] flex items-center gap-2 rounded-md border border-border/80 bg-popover px-2 py-1 text-ui-xs text-popover-foreground shadow-overlay data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

export interface TooltipProps {
  label: React.ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ label, shortcut, side = "bottom", children, delay = 400 }: TooltipProps) {
  return (
    <TooltipRoot delayDuration={delay}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6}>
        <span>{label}</span>
        {shortcut && (
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
            {shortcut}
          </span>
        )}
      </TooltipContent>
    </TooltipRoot>
  );
}
