import { expect, it } from "vitest";
import { findMentions, toPlainText } from "./parse";

it("DATA-001.1, DATA-001.6, DATA-001: @sam is found next to punctuation, once per member", () => {
  expect(findMentions("Can @sam take this?")).toEqual(["sam"]);
  expect(findMentions("Ask (@sam)")).toEqual(["sam"]);
  expect(findMentions("@sam, thanks")).toEqual(["sam"]);
  expect(findMentions("@sam and @jo, then @sam again")).toEqual(["sam", "jo"]);
});

it("DATA-001.4, DATA-001.5: @ in code, in emails or inside words is not a mention", () => {
  expect(findMentions("Run `@sam` now")).toEqual([]);
  expect(findMentions("```\n@sam\n```")).toEqual([]);
  expect(findMentions("Mail sam@acme.com")).toEqual([]);
  expect(findMentions("See foo@sam")).toEqual([]);
});

it("REQ-044: plain-text excerpt drops Markdown syntax", () => {
  const source = "# Title\n\nSome **bold** and [a link](https://x.example)\n\n- one\n- two";
  expect(toPlainText(source)).toBe("Title\nSome bold and a link\none\ntwo");
});