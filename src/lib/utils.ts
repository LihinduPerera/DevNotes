import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayTitle(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Untitled note";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const delta = Math.round((time - now) / 1000);
  const abs = Math.abs(delta);
  if (abs < 45) return "just now";
  if (abs < 3600) {
    const minutes = Math.round(abs / 60);
    return delta < 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }
  if (abs < 86_400) {
    const hours = Math.round(abs / 3600);
    return delta < 0 ? `${hours}h ago` : `in ${hours}h`;
  }
  if (abs < 604_800) {
    const days = Math.round(abs / 86_400);
    return delta < 0 ? `${days}d ago` : `in ${days}d`;
  }
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const shape = error as { message?: unknown; code?: unknown };
    if (typeof shape.message === "string" && shape.message.length > 0) return shape.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}

export function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

export function isConflict(error: unknown): boolean {
  return errorCode(error) === "CONFLICT";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}
