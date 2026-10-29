import { beforeEach, describe, expect, it } from "vitest";
import { journal, type JournalEntry } from "./journal";
import type { JSONContent } from "./types";

const DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
};

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    noteId: "note-1",
    revision: 4,
    title: "Materials",
    doc: DOC,
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("journal", () => {
  beforeEach(() => {
    journal.clear();
  });

  it("round-trips a journal entry through storage", () => {
    journal.put(entry());
    expect(journal.get("note-1")).toMatchObject({ noteId: "note-1", revision: 4 });
    expect(journal.count()).toBe(1);
  });

  it("ignores entries stored under a mismatched key", () => {
    journal.put(entry({ noteId: "note-2" }));
    expect(journal.get("note-1")).toBeNull();
  });

  it("removes entries and keeps the rest", () => {
    journal.put(entry());
    journal.put(entry({ noteId: "note-2" }));
    journal.remove("note-1");
    expect(journal.get("note-1")).toBeNull();
    expect(journal.get("note-2")).not.toBeNull();
    expect(journal.count()).toBe(1);
  });

  it("is a no-op when removing a missing entry", () => {
    expect(() => journal.remove("missing")).not.toThrow();
    expect(journal.count()).toBe(0);
  });

  describe("status", () => {
    const remote = { revision: 4, title: "Materials", doc: DOC };

    it("reports none without an entry", () => {
      expect(journal.status(null, remote)).toBe("none");
    });

    it("treats a different revision as stale", () => {
      expect(journal.status(entry({ revision: 3 }), remote)).toBe("stale");
    });

    it("detects an identical draft", () => {
      expect(journal.status(entry(), remote)).toBe("identical");
    });

    it("offers recovery when the draft diverges", () => {
      expect(journal.status(entry({ title: "Materials WIP" }), remote)).toBe("recoverable");
      expect(
        journal.status(
          entry({
            doc: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Changed" }] }],
            },
          }),
          remote,
        ),
      ).toBe("recoverable");
    });
  });

  it("survives corrupted storage payloads", () => {
    window.localStorage.setItem("unrealnotes.recovery.v1", "{not json");
    expect(journal.get("note-1")).toBeNull();
    expect(journal.count()).toBe(0);

    window.localStorage.setItem("unrealnotes.recovery.v1", "null");
    expect(journal.count()).toBe(0);
  });
});
