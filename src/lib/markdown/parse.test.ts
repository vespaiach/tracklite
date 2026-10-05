import { expect, it } from "vitest";
import { findMentions, toPlainText } from "./parse";

it("DATA-001.1: @sam is found as a mention of sam", () => {
  expect(findMentions("Can @sam take this?")).toEqual(["sam"]);
});

it("DATA-001.4: @sam in inline code or a code block is not a mention", () => {
  expect(findMentions("Run `@sam` now")).toEqual([]);
  expect(findMentions("```\n@sam\n```")).toEqual([]);
});

it("DATA-001.5: sam@acme.com and foo@sam are not mentions", () => {
  expect(findMentions("Mail sam@acme.com")).toEqual([]);
  expect(findMentions("See foo@sam")).toEqual([]);
});

it("DATA-001.6: (@sam) and @sam, thanks both mention Sam", () => {
  expect(findMentions("Ask (@sam)")).toEqual(["sam"]);
  expect(findMentions("@sam, thanks")).toEqual(["sam"]);
});

it("DATA-001: a member mentioned several times is found once", () => {
  expect(findMentions("@sam and @jo, then @sam again")).toEqual(["sam", "jo"]);
});

it("REQ-044: plain-text excerpt drops Markdown syntax", () => {
  const source = "# Title\n\nSome **bold** and [a link](https://x.example)\n\n- one\n- two";
  expect(toPlainText(source)).toBe("Title\nSome bold and a link\none\ntwo");
});