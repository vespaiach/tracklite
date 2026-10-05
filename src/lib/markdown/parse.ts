import type { Nodes, Parents, Root, RootContent, Text } from "mdast";
import { toString as nodeText } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const mentionPattern = /(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{2,20})(?![a-z0-9-])/g;

const plainTextBlocks = new Set(["paragraph", "heading", "code", "html", "tableCell"]);

function parents(node: Nodes): Parents[] {
  if (!("children" in node)) return [];
  return [node, ...node.children.flatMap((child) => parents(child))];
}

function htmlAsText() {
  return (tree: Root) => {
    for (const parent of parents(tree)) {
      for (const child of parent.children) {
        if (child.type === "html") (child as RootContent).type = "text";
      }
    }
  };
}

function splitMentions(text: Text): Text[] {
  const pieces: Text[] = [];
  let last = 0;
  for (const match of text.value.matchAll(mentionPattern)) {
    if (match.index > last) pieces.push({ type: "text", value: text.value.slice(last, match.index) });
    pieces.push({
      type: "text",
      value: match[0],
      data: { hName: "span", hProperties: { dataMention: match[1] } },
    });
    last = match.index + match[0].length;
  }
  if (last === 0) return [text];
  if (last < text.value.length) pieces.push({ type: "text", value: text.value.slice(last) });
  return pieces;
}

function mentions() {
  return (tree: Root) => {
    for (const parent of parents(tree)) {
      parent.children = parent.children.flatMap<RootContent>((child) =>
        child.type === "text" ? splitMentions(child) : [child],
      ) as typeof parent.children;
    }
  };
}

export const remarkPlugins = [remarkGfm, htmlAsText, mentions];

const processor = unified().use(remarkParse).use(remarkPlugins);

function parse(markdown: string): Root {
  return processor.runSync(processor.parse(markdown)) as Root;
}

function mentionedUsername(node: Nodes): string | undefined {
  const username = node.data?.hProperties?.dataMention;
  return typeof username === "string" ? username : undefined;
}

export function findMentions(markdown: string): string[] {
  const usernames = parents(parse(markdown)).flatMap((parent) =>
    parent.children.map(mentionedUsername).filter((username) => username !== undefined),
  );
  return [...new Set(usernames)];
}

function blockTexts(node: Nodes): string[] {
  if (plainTextBlocks.has(node.type)) return [nodeText(node)];
  return "children" in node ? node.children.flatMap(blockTexts) : [];
}

export function toPlainText(markdown: string): string {
  return blockTexts(processor.parse(markdown))
    .filter((text) => text !== "")
    .join("\n");
}