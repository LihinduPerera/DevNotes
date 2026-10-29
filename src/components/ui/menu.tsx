import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as ContextPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const contentClass =
  "z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]";

const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-ui-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuPortal = DropdownPrimitive.Portal;
export const DropdownMenuSub = DropdownPrimitive.Sub;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(contentClass, className)}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownPrimitive.Item
    ref={ref}
    className={cn(itemClass, inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(itemClass, "pl-8", className)}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-ui-xs font-medium uppercase tracking-[0.08em] text-muted-foreground", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border/70", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuShortcut = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    className={cn("ml-auto pl-4 font-mono text-[10px] tracking-wider text-muted-foreground/80", className)}
    {...props}
  />
);

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownPrimitive.SubTrigger
    ref={ref}
    className={cn(itemClass, "data-[state=open]:bg-accent", className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.SubContent
      ref={ref}
      className={cn(contentClass, "max-h-80 overflow-y-auto", className)}
      {...props}
    />
  </DropdownPrimitive.Portal>
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

// ---------------------------------------------------------------------------
// Context menu shares the same visual language.
// ---------------------------------------------------------------------------

export const ContextMenu = ContextPrimitive.Root;
export const ContextMenuTrigger = ContextPrimitive.Trigger;
export const ContextMenuGroup = ContextPrimitive.Group;
export const ContextMenuSub = ContextPrimitive.Sub;

export const ContextMenuContent = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.Content
      ref={ref}
      className={cn(contentClass, className)}
      {...props}
    />
  </ContextPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuItem = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <ContextPrimitive.Item
    ref={ref}
    className={cn(itemClass, inset && "pl-8", className)}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuLabel = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Label>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-ui-xs font-medium uppercase tracking-[0.08em] text-muted-foreground", className)}
    {...props}
  />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

export const ContextMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border/70", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export const ContextMenuShortcut = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span
    className={cn("ml-auto pl-4 font-mono text-[10px] tracking-wider text-muted-foreground/80", className)}
    {...props}
  />
);

export const ContextMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextPrimitive.SubTrigger
    ref={ref}
    className={cn(itemClass, "data-[state=open]:bg-accent", className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </ContextPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export const ContextMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof ContextPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextPrimitive.Portal>
    <ContextPrimitive.SubContent
      ref={ref}
      className={cn(contentClass, "max-h-80 overflow-y-auto", className)}
      {...props}
    />
  </ContextPrimitive.Portal>
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";
