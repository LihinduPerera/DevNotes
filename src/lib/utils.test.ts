import { describe, expect, it } from "vitest";
import {
  clamp,
  displayTitle,
  errorCode,
  errorMessage,
  formatBytes,
  formatRelative,
  isConflict,
  isTypingTarget,
  pluralize,
} from "./utils";

describe("displayTitle", () => {
  it("falls back for empty or whitespace titles", () => {
    expect(displayTitle("")).toBe("Untitled note");
    expect(displayTitle("   ")).toBe("Untitled note");
    expect(displayTitle(null)).toBe("Untitled note");
    expect(displayTitle(undefined)).toBe("Untitled note");
  });

  it("trims real titles without altering their content", () => {
    expect(displayTitle("  Materials  ")).toBe("Materials");
  });
});

describe("formatBytes", () => {
  it("uses binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-03-10T12:00:00Z").getTime();

  it("returns an empty string for missing or invalid input", () => {
    expect(formatRelative(null)).toBe("");
    expect(formatRelative(undefined)).toBe("");
    expect(formatRelative("not-a-date")).toBe("");
  });

  it("describes recent, past, and future instants", () => {
    expect(formatRelative(new Date(now - 5_000).toISOString(), now)).toBe("just now");
    expect(formatRelative(new Date(now - 10 * 60_000).toISOString(), now)).toBe("10m ago");
    expect(formatRelative(new Date(now + 3 * 3_600_000).toISOString(), now)).toBe("in 3h");
    expect(formatRelative(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe("2d ago");
  });
});

describe("pluralize", () => {
  it("selects the singular form for exactly one", () => {
    expect(pluralize(1, "note")).toBe("1 note");
    expect(pluralize(0, "note")).toBe("0 notes");
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});

describe("error helpers", () => {
  it("extracts messages from strings, objects, and errors", () => {
    expect(errorMessage("boom")).toBe("boom");
    expect(errorMessage({ message: "structured" })).toBe("structured");
    expect(errorMessage(new Error("thrown"))).toBe("thrown");
    expect(errorMessage(42)).toBe("Something went wrong");
  });

  it("detects optimistic-concurrency conflicts", () => {
    expect(errorCode({ code: "CONFLICT" })).toBe("CONFLICT");
    expect(isConflict({ code: "CONFLICT" })).toBe(true);
    expect(isConflict(new Error("CONFLICT"))).toBe(false);
    expect(isConflict({ code: "NOT_FOUND" })).toBe(false);
  });
});

describe("clamp", () => {
  it("bounds values on both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("isTypingTarget", () => {
  it("recognises form controls and contenteditable", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);

    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });
});
