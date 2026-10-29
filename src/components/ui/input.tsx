import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-ui shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-20 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-ui outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
