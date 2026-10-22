import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Markdown } from "./Markdown";

afterEach(cleanup);

const sam = { username: "sam", fullName: "Sam Lee" };

it("SEC-002.1, REQ-012.3: raw HTML (<img onerror>, <script>) is shown as text", () => {
  const { container, rerender } = render(<Markdown source="<img src=x onerror=alert(1)>" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img src=x onerror=alert(1)>");

  rerender(<Markdown source="<script>alert(1)</script>" />);
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>alert(1)</script>");
});

it("SEC-002.2: [click](javascript:alert(1)) is plain text, not a link", () => {
  const { container } = render(<Markdown source="[click](javascript:alert(1))" />);
  expect(container.querySelector("a")).toBeNull();
  expect(container.textContent).toBe("click");
});

it("SEC-002: http, https and mailto links open in a new tab without opener", () => {
  const { container } = render(
    <Markdown source="[a](http://a.example) [b](https://b.example) [c](mailto:c@x.example)" />,
  );
  const links = [...container.querySelectorAll("a")];
  expect(links.map((a) => a.getAttribute("href"))).toEqual([
    "http://a.example",
    "https://b.example",
    "mailto:c@x.example",
  ]);
  for (const a of links) {
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  }
});

it("DATA-001.1, DATA-001.2, DATA-001.4: only a listed @member outside code is highlighted, titled with their name", () => {
  const { container } = render(
    <Markdown
      source={"Can @sam take this? Ping @nobody. Run `@sam`\n\n```\n@sam\n```"}
      mentions={[sam]}
    />,
  );
  const mentions = [...container.querySelectorAll(".tl-mention")];
  expect(mentions.map((mention) => mention.textContent)).toEqual(["@sam"]);
  expect(mentions[0].getAttribute("title")).toBe("Sam Lee");
  expect(container.querySelector("a")).toBeNull();

  expect(container.textContent).toContain("Ping @nobody.");

  expect([...container.querySelectorAll("code")].map((c) => c.textContent?.trim())).toEqual(["@sam", "@sam"]);
});