import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  pending?: boolean;
  onSubmit: (value: string) => void;
}

export function NameDialog({ open, onOpenChange, ...props }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {/* Mounting the form only while open gives every invocation a clean
            field without resetting state from an effect. */}
        {open ? <NameDialogForm onOpenChange={onOpenChange} {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NameDialogForm({
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  submitLabel = "Save",
  pending = false,
  onSubmit,
}: Omit<NameDialogProps, "open">) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, []);

  const trimmed = value.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || pending) return;
        onSubmit(trimmed);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="name-dialog-input" className="text-ui-sm">
          {label}
        </Label>
        <Input
          id="name-dialog-input"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          autoComplete="off"
        />
      </div>
      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!trimmed || pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
