import { useSyncExternalStore } from "react";
import type { ThemeMode } from "./types";

const STORAGE_KEY = "unrealnotes.theme";
const listeners = new Set<() => void>();

function readStored(): ThemeMode {
  if (typeof localStorage === "undefined") return "dark";
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "dark";
}

let mode: ThemeMode = readStored();
let media: MediaQueryList | null = null;

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolved(): "light" | "dark" {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

/**
 * Keep the native window chrome in step with the app theme. The window API is
 * imported lazily so the browser build never pays for it.
 */
function syncWindowTheme(theme: "light" | "dark"): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme))
    .catch(() => {
      // Not running under Tauri, or the window is already gone.
    });
}

export function applyTheme(): void {
  if (typeof document === "undefined") return;
  const theme = resolved();
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  syncWindowTheme(theme);
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage can be unavailable in hardened webviews; the theme still applies.
  }
  applyTheme();
  for (const listener of listeners) listener();
}

export function cycleTheme(): void {
  setThemeMode(mode === "dark" ? "light" : mode === "light" ? "system" : "dark");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
}

export function initTheme(): void {
  applyTheme();
  if (typeof window === "undefined" || !window.matchMedia) return;
  if (!media) {
    media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", () => {
      if (mode === "system") {
        applyTheme();
        for (const listener of listeners) listener();
      }
    });
  }
}

export function themeLabel(value: ThemeMode): string {
  if (value === "system") return "System";
  return value === "dark" ? "Dark" : "Light";
}
