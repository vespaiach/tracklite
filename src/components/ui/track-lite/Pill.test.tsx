import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TipTrigger } from "./Pill";

afterEach(cleanup);

const fullName = "Customer research for the new member onboarding UX · RES";

function renderTrigger() {
  render(
    <TipTrigger tip={fullName}>
      <a
        href="/project/RES/board"
        aria-describedby="hint">
        Customer research
      </a>
    </TipTrigger>,
  );
  return screen.getByRole("link");
}

it("REQ-015.2: shows the full name while the pointer is over it", () => {
  const link = renderTrigger();
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(link);
  expect(screen.getByRole("tooltip").textContent).toBe(fullName);
  fireEvent.mouseLeave(link);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("shows the tip on keyboard focus and hides it on blur", () => {
  const link = renderTrigger();
  const matches = link.matches.bind(link);
  vi.spyOn(link, "matches").mockImplementation(
    (selector) => selector === ":focus-visible" || matches(selector),
  );
  act(() => link.focus());
  expect(screen.getByRole("tooltip").textContent).toBe(fullName);
  act(() => link.blur());
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("hides the tip on Escape", () => {
  const link = renderTrigger();
  fireEvent.mouseEnter(link);
  fireEvent.keyDown(link, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("describes the child by the tip and keeps its existing description", () => {
  const link = renderTrigger();
  const ids = link.getAttribute("aria-describedby")?.split(" ") ?? [];
  expect(ids[0]).toBe("hint");
  expect(ids).toHaveLength(2);
  expect(document.getElementById(ids[1])?.textContent).toBe(fullName);
});