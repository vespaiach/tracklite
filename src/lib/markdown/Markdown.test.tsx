import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Markdown } from "./Markdown";

afterEach(cleanup);

const sam = { username: "sam", fullName: "Sam Lee" };

it("SEC-002.1: <img src=x onerror=alert(1)> is shown as text", () => {
  const { container } = render(<Markdown source="<img src=x onerror=alert(1)>" />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
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

it('DATA-001.1: @sam is highlighted with "Sam Lee" on hover', () => {
  const { container } = render(
    <Markdown
      source="Can @sam take this?"
      mentions={[sam]}
    />,
  );
  const mention = container.querySelector(".tl-mention");
  expect(mention?.textContent).toBe("@sam");
  expect(mention?.getAttribute("title")).toBe("Sam Lee");
  expect(container.querySelector("a")).toBeNull();
});

it("DATA-001.2: @nobody, not in the mentions list, is plain text", () => {
  const { container } = render(
    <Markdown
      source="Ping @nobody"
      mentions={[sam]}
    />,
  );
  expect(container.querySelector(".tl-mention")).toBeNull();
  expect(container.textContent).toBe("Ping @nobody");
});

it("DATA-001.4: @sam in inline code or a code block is code, not a mention", () => {
  const { container } = render(
    <Markdown
      source={"Run `@sam`\n\n```\n@sam\n```"}
      mentions={[sam]}
    />,
  );
  expect(container.querySelector(".tl-mention")).toBeNull();
  expect([...container.querySelectorAll("code")].map((c) => c.textContent?.trim())).toEqual(["@sam", "@sam"]);
});

it("REQ-012.1: a description with a heading and a bullet list is shown formatted", () => {
  const { container } = render(<Markdown source={"# Goals\n\n- Faster pages\n- Fewer bugs"} />);
  expect(container.querySelector("h1")?.textContent).toBe("Goals");
  expect([...container.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual([
    "Faster pages",
    "Fewer bugs",
  ]);
});

it("REQ-012.3: <script>alert(1)</script> in a description is shown as text", () => {
  const { container } = render(<Markdown source="<script>alert(1)</script>" />);
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>alert(1)</script>");
});