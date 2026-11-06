import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Link, useLeaveGuard } from "./leave-guard";

const navigate = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
  }: {
    href: string;
    onNavigate: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        let prevented = false;
        onNavigate({ preventDefault: () => (prevented = true) });
        if (!prevented) navigate(href);
      }}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

const unsentComment = "You have an unsent comment. Leave anyway?";

function CommentBox({ text }: { text: string }) {
  useLeaveGuard(text === "" ? null : unsentComment);
  return <textarea defaultValue={text} />;
}

function renderPage(text: string) {
  render(
    <>
      <CommentBox text={text} />
      <Link href="/projects/API">API</Link>
    </>,
  );
}

it("REQ-035.1, REQ-035.3: a link asks with the guard's message while it is active, and Cancel stays on the page with the text intact", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  renderPage("Looks good");

  fireEvent.click(screen.getByRole("link", { name: "API" }));

  expect(confirm).toHaveBeenCalledWith(unsentComment);
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toHaveProperty("value", "Looks good");
});

it("REQ-035.2: with nothing unsent the link leaves without asking", () => {
  const confirm = vi.spyOn(window, "confirm");
  renderPage("");

  fireEvent.click(screen.getByRole("link", { name: "API" }));

  expect(confirm).not.toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith("/projects/API");
});

it("REQ-035.4: closing or reloading the tab is held for the browser's prompt only while a guard is active", () => {
  renderPage("Looks good");
  const guarded = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(guarded);
  expect(guarded.defaultPrevented).toBe(true);

  cleanup();
  const unguarded = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unguarded);
  expect(unguarded.defaultPrevented).toBe(false);
});