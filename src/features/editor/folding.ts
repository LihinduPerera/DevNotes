import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface BlockInfo {
  pos: number;
  size: number;
  type: string;
  level?: number;
  blockId?: string | null;
}

/** Ranges hidden by folded headings, computed from top-level blocks. */
export function hiddenRanges(
  blocks: BlockInfo[],
  folded: Set<string>,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  if (folded.size === 0 || blocks.length === 0) return ranges;

  const docEnd = blocks[blocks.length - 1]!.pos + blocks[blocks.length - 1]!.size;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.type !== "heading" || !block.blockId || !folded.has(block.blockId)) {
      continue;
    }
    const level = block.level ?? 1;
    let end = docEnd;
    for (let next = index + 1; next < blocks.length; next += 1) {
      const candidate = blocks[next]!;
      if (candidate.type === "heading" && (candidate.level ?? 1) <= level) {
        end = candidate.pos;
        break;
      }
    }
    const from = block.pos + block.size;
    if (end > from) ranges.push({ from, to: end });
  }

  return ranges;
}

export function topLevelBlocks(doc: ProseMirrorNode): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  doc.forEach((node, offset) => {
    blocks.push({
      pos: offset,
      size: node.nodeSize,
      type: node.type.name,
      level: node.type.name === "heading" ? Number(node.attrs.level ?? 1) : undefined,
      blockId:
        typeof node.attrs.blockId === "string" && node.attrs.blockId.length > 0
          ? (node.attrs.blockId as string)
          : null,
    });
  });
  return blocks;
}

let counter = 0;

export function blockIdForHeading(): string {
  counter = (counter + 1) % 1_000_000;
  return `h-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export interface OutlineEntry {
  blockId: string;
  level: number;
  text: string;
  pos: number;
  folded: boolean;
  hasChildren: boolean;
}

export function buildOutline(
  doc: ProseMirrorNode,
  folded: Set<string>,
): OutlineEntry[] {
  const blocks = topLevelBlocks(doc);
  const headings = blocks.filter((block) => block.type === "heading" && block.blockId);
  return headings.map((heading, index) => {
    const node = doc.nodeAt(heading.pos);
    const next = headings[index + 1];
    return {
      blockId: heading.blockId as string,
      level: heading.level ?? 1,
      text: node?.textContent.trim() || "Untitled section",
      pos: heading.pos,
      folded: folded.has(heading.blockId as string),
      hasChildren: Boolean(next && (next.level ?? 1) > (heading.level ?? 1)),
    };
  });
}
