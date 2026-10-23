import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BoardCard, CollapsibleListGroup, ListRowHead, ListRowLink } from "./ListRow";

afterEach(cleanup);

it("BoardCard links its title to the issue, with the handle and ⋯ as separate controls in tab order", () => {
  const onOpen = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
  render(
    <BoardCard
      id="WEB-42"
      title="Fix login button"
      href="/issue/WEB-42"
      onOpen={onOpen}
      handle={<button type="button">Drag WEB-42</button>}
      menu={<button type="button">WEB-42 actions</button>}
      assignee={<span>SL</span>}
      foot={<span>bug</span>}
    />,
  );

  const card = screen.getByRole("article", { name: "Fix login button" });
  const link = within(card).getByRole("link", { name: "Fix login button" });
  expect(link.getAttribute("href")).toBe("/issue/WEB-42");
  expect(card.textContent).toContain("WEB-42");
  expect(card.textContent).toContain("SL");
  expect(card.textContent).toContain("bug");

  const focusable = Array.from(card.querySelectorAll("a, button")).map((element) => element.textContent);
  expect(focusable).toEqual(["Drag WEB-42", "Fix login button", "WEB-42 actions"]);

  fireEvent.click(link);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

function TwoGroups({ todoExpanded }: { todoExpanded?: boolean }) {
  return (
    <>
      <CollapsibleListGroup
        id="group-todo"
        label="Todo"
        count={1}
        defaultExpanded={todoExpanded}
        skipTo={{ id: "group-done", label: "Done" }}>
        <a href="/issue/WEB-1">WEB-1</a>
      </CollapsibleListGroup>
      <CollapsibleListGroup
        id="group-done"
        label="Done"
        count={2}
        defaultExpanded={false}>
        <a href="/issue/WEB-2">WEB-2</a>
      </CollapsibleListGroup>
    </>
  );
}

it("CollapsibleListGroup: the head button toggles its rows and aria-expanded, starting from defaultExpanded", () => {
  render(<TwoGroups />);
  const todo = screen.getByRole("button", { name: "Todo 1" });
  const done = screen.getByRole("button", { name: "Done 2" });
  expect(todo.getAttribute("aria-expanded")).toBe("true");
  expect(done.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "WEB-1" })).not.toBeNull();
  expect(screen.queryByRole("link", { name: "WEB-2" })).toBeNull();

  fireEvent.click(todo);
  expect(todo.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "WEB-1" })).toBeNull();

  fireEvent.click(done);
  expect(done.getAttribute("aria-expanded")).toBe("true");
  expect(screen.queryByRole("link", { name: "WEB-2" })).not.toBeNull();
});

it("CollapsibleListGroup: the skip link moves focus to the next group's head and is gone while collapsed", () => {
  const { unmount } = render(<TwoGroups />);
  const skip = screen.getByRole("link", { name: "Skip to Done" });
  fireEvent.click(skip);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done 2" }));
  unmount();

  render(<TwoGroups todoExpanded={false} />);
  expect(screen.queryByRole("link", { name: "Skip to Done" })).toBeNull();
});

it("ListRowLink and ListRowHead share the grid columns; the head row is hidden from assistive tech", () => {
  const columns = "14px 64px minmax(240px, 1fr) 100px";
  const { container } = render(
    <>
      <ListRowHead columns={columns}>
        <span>ID</span>
      </ListRowHead>
      <ListRowLink
        columns={columns}
        href="/issue/WEB-42"
        label="WEB-42, Fix login button">
        <span>WEB-42</span>
      </ListRowLink>
    </>,
  );
  const head = container.firstElementChild as HTMLElement;
  const link = screen.getByRole("link", { name: "WEB-42, Fix login button" });
  expect(head.getAttribute("aria-hidden")).toBe("true");
  expect(head.style.gridTemplateColumns).toBe(columns);
  expect(link.style.gridTemplateColumns).toBe(columns);
  expect(link.getAttribute("href")).toBe("/issue/WEB-42");
});