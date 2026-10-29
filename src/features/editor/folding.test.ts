import { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  blockIdForHeading,
  buildOutline,
  hiddenRanges,
  topLevelBlocks,
  type BlockInfo,
} from "./folding";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    heading: {
      attrs: {
        level: { default: 1 },
        blockId: { default: null },
      },
      content: "inline*",
      group: "block",
      defining: true,
      toDOM: (node) => [`h${node.attrs.level as number}`, 0],
    },
    paragraph: {
      content: "inline*",
      group: "block",
      toDOM: () => ["p", 0],
    },
  },
});

function heading(level: number, blockId: string, text: string) {
  return {
    type: "heading",
    attrs: { level, blockId },
    content: text ? [{ type: "text", text }] : [],
  };
}

function paragraph(text: string) {
  return { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
}

const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    heading(1, "h1", "Materials"),
    paragraph("Intro"),
    heading(2, "h2", "Metal"),
    paragraph("Albedo"),
    heading(3, "h3", "Roughness"),
    paragraph("Values"),
    heading(2, "h2b", "Wood"),
    paragraph("Grain"),
    heading(1, "h1b", "Blueprints"),
  ],
});

function blocksOf(docNode: typeof doc): BlockInfo[] {
  return topLevelBlocks(docNode);
}

describe("topLevelBlocks", () => {
  it("captures position, size, heading level, and block id", () => {
    const blocks = blocksOf(doc);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
    ]);
    expect(blocks[0]).toMatchObject({ pos: 0, level: 1, blockId: "h1" });
    expect(blocks[2]).toMatchObject({ level: 2, blockId: "h2" });
    expect(blocks[1]?.blockId).toBeNull();
  });
});

describe("hiddenRanges", () => {
  const blocks = blocksOf(doc);

  it("returns nothing when no heading is folded", () => {
    expect(hiddenRanges(blocks, new Set())).toEqual([]);
  });

  it("hides a folded heading's body up to the next same-or-higher heading", () => {
    const ranges = hiddenRanges(blocks, new Set(["h2"]));
    const start = blocks[2]!.pos + blocks[2]!.size;
    const end = blocks[6]!.pos; // "Wood"
    expect(ranges).toEqual([{ from: start, to: end }]);
  });

  it("stops at the next heading of the same or higher level", () => {
    const ranges = hiddenRanges(blocks, new Set(["h1"]));
    const start = blocks[0]!.pos + blocks[0]!.size;
    // "Blueprints" is the next level-1 heading.
    expect(ranges).toEqual([{ from: start, to: blocks[8]!.pos }]);
  });

  it("hides through the document end when no same-level heading follows", () => {
    const nested = schema.nodeFromJSON({
      type: "doc",
      content: [
        heading(2, "a", "Section"),
        paragraph("Body"),
        heading(3, "b", "Deeper"),
        paragraph("Tail"),
      ],
    });
    const nestedBlocks = blocksOf(nested);
    const ranges = hiddenRanges(nestedBlocks, new Set(["a"]));
    const start = nestedBlocks[0]!.pos + nestedBlocks[0]!.size;
    const last = nestedBlocks[nestedBlocks.length - 1]!;
    expect(ranges).toEqual([{ from: start, to: last.pos + last.size }]);
  });

  it("can fold several headings independently", () => {
    const ranges = hiddenRanges(blocks, new Set(["h2", "h2b"]));
    expect(ranges).toHaveLength(2);
    expect(ranges[1]).toEqual({
      from: blocks[6]!.pos + blocks[6]!.size,
      to: blocks[8]!.pos,
    });
  });

  it("ignores unknown ids and non-heading folds", () => {
    expect(hiddenRanges(blocks, new Set(["missing"]))).toEqual([]);
    expect(hiddenRanges([], new Set(["h1"]))).toEqual([]);
  });
});

describe("buildOutline", () => {
  it("lists headings in document order with nesting hints", () => {
    const outline = buildOutline(doc, new Set(["h2"]));
    expect(outline.map((item) => item.blockId)).toEqual(["h1", "h2", "h3", "h2b", "h1b"]);
    expect(outline[0]).toMatchObject({
      level: 1,
      text: "Materials",
      folded: false,
      hasChildren: true,
    });
    expect(outline[1]).toMatchObject({ level: 2, text: "Metal", folded: true });
    expect(outline[4]).toMatchObject({ level: 1, text: "Blueprints", hasChildren: false });
  });

  it("labels empty headings", () => {
    const empty = schema.nodeFromJSON({
      type: "doc",
      content: [heading(2, "empty", "")],
    });
    expect(buildOutline(empty, new Set())[0]).toMatchObject({
      text: "Untitled section",
      hasChildren: false,
    });
  });
});

describe("blockIdForHeading", () => {
  it("produces unique, h-prefixed ids", () => {
    const ids = new Set(Array.from({ length: 500 }, () => blockIdForHeading()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id.startsWith("h-")).toBe(true);
  });
});
