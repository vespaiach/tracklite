import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TipTrigger } from "./Pill";

afterEach(cleanup);

const fullName = "Customer research for the new member onboarding UX · RES";

it("REQ-015.2: the tip shows on hover or keyboard focus, hides on leave, blur or Escape, and adds to the child's description", () => {
  render(
    <TipTrigger tip={fullName}>
      <a
        href="/project/RES/board"
        aria-describedby="hint">
        Customer research
      </a>
    </TipTrigger>,
  );
  const link = screen.getByRole("link");
  const ids = link.getAttribute("aria-describedby")?.split(" ") ?? [];
  expect(ids[0]).toBe("hint");
  expect(ids).toHaveLength(2);
  expect(document.getElementById(ids[1])?.textContent).toBe(fullName);

  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.mouseEnter(link);
  expect(screen.getByRole("tooltip").textContent).toBe(fullName);
  fireEvent.mouseLeave(link);
  expect(screen.queryByRole("tooltip")).toBeNull();

  fireEvent.mouseEnter(link);
  fireEvent.keyDown(link, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();

  const matches = link.matches.bind(link);
  vi.spyOn(link, "matches").mockImplementation(
    (selector) => selector === ":focus-visible" || matches(selector),
  );
  act(() => link.focus());
  expect(screen.getByRole("tooltip").textContent).toBe(fullName);
  act(() => link.blur());
  expect(screen.queryByRole("tooltip")).toBeNull();
});