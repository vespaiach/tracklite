import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AvatarStack, TipTrigger } from "./Pill";

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

const team = [
  { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false },
  { username: "nina", fullName: "Nina Shah", initials: "NS", deactivated: false },
  { username: "jo", fullName: "Jo Park", initials: "JP", deactivated: true },
  { username: "sam", fullName: "Sam Lee", initials: "SL", deactivated: false },
  { username: "max", fullName: "Max Ito", initials: "MI", deactivated: false },
];

function renderStack(count: number) {
  cleanup();
  const { container } = render(<AvatarStack members={team.slice(0, count)} />);
  const stack = container.firstElementChild as HTMLElement;
  const shown = [...stack.querySelectorAll(".tl-avatar")].map((avatar) => avatar.textContent);
  return { stack, shown, more: stack.querySelector(".tl-avstack__more")?.textContent ?? null };
}

it("REQ-025: an avatar stack shows up to 3 members then +N, titled with every full name and (deactivated)", () => {
  const one = renderStack(1);
  expect(one.shown).toEqual(["AK"]);
  expect(one.more).toBeNull();
  expect(one.stack.title).toBe("Alex Kim");

  const three = renderStack(3);
  expect(three.shown).toEqual(["AK", "NS", "JP"]);
  expect(three.more).toBeNull();
  expect(three.stack.title).toBe("Alex Kim, Nina Shah, Jo Park (deactivated)");

  const five = renderStack(5);
  expect(five.shown).toEqual(["AK", "NS", "JP"]);
  expect(five.more).toBe("+2");
  expect(five.stack.title).toBe("Alex Kim, Nina Shah, Jo Park (deactivated), Sam Lee, Max Ito");
});