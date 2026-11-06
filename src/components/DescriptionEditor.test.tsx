import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Me } from "../contract";
import { alex, sam } from "../test/client-app";
import { done, renderForm } from "../test/forms";
import { type DescriptionDraft, DescriptionEditor } from "./DescriptionEditor";

afterEach(() => {
  cleanup();
});

const jordan: Me = { ...alex, username: "jordan", fullName: "Jordan Diaz", initials: "JD" };
const priya: Me = { ...alex, username: "priya", fullName: "Priya Shah", initials: "PS", deactivated: true };

function openEditor() {
  const save = vi.fn(async () => done);

  function Editing() {
    const [draft, setDraft] = useState<DescriptionDraft | undefined>({
      text: "",
      startedFrom: "",
      version: 0,
    });
    return (
      draft && (
        <DescriptionEditor
          draft={draft}
          members={[alex, jordan, priya, sam]}
          onChange={(text) => setDraft({ ...draft, text })}
          onDone={() => setDraft(undefined)}
          onReload={() => {}}
          save={save}
        />
      )
    );
  }

  renderForm(<Editing />);
  return {
    editor: screen.getByRole("textbox", { name: "Description (Markdown)" }) as HTMLTextAreaElement,
    save,
  };
}

function type(editor: HTMLTextAreaElement, value: string) {
  fireEvent.change(editor, { target: { value } });
  editor.setSelectionRange(value.length, value.length);
  fireEvent.select(editor);
}

function suggestions() {
  return screen.queryByRole("listbox", { name: "Mention a member" });
}

function suggestedUsernames() {
  const list = suggestions();
  if (!list) return [];
  return within(list)
    .queryAllByRole("option")
    .map((option) => option.getAttribute("data-key"));
}

it("DATA-001, DATA-001.5: @ suggests active members, filtered by username or name, says No results, and ignores an @ inside a word", async () => {
  const { editor } = openEditor();
  type(editor, "Pairing with @");
  expect(await screen.findByRole("listbox", { name: "Mention a member" })).toBeTruthy();
  expect(suggestedUsernames()).toEqual(["alex", "jordan", "sam"]);

  type(editor, "Pairing with @al");
  expect(suggestedUsernames()).toEqual(["alex"]);

  type(editor, "Pairing with @lee");
  expect(suggestedUsernames()).toEqual(["sam"]);

  type(editor, "Pairing with @zz");
  expect(within(suggestions() as HTMLElement).getByRole("status").textContent).toBe("No results for “@zz”");

  type(editor, "Write to foo@sa");
  expect(suggestions()).toBeNull();
});

it("DATA-001: Enter or a click on a suggestion inserts @username and keeps focus in the editor", async () => {
  const { editor, save } = openEditor();
  editor.focus();
  type(editor, "Pairing with @al");
  fireEvent.keyDown(editor, { key: "Enter" });

  expect(editor.value).toBe("Pairing with @alex ");
  expect(suggestions()).toBeNull();
  expect(document.activeElement).toBe(editor);

  type(editor, "Pairing with @alex and @sa");
  const sam = within(suggestions() as HTMLElement).getByRole("option", { name: /Sam Lee/ });
  fireEvent.mouseDown(sam);
  fireEvent.click(sam);

  expect(editor.value).toBe("Pairing with @alex and @sam ");
  expect(document.activeElement).toBe(editor);
  expect(save).not.toHaveBeenCalled();
});

it("DATA-001, NFR-007: the arrow keys move the highlighted suggestion, announced without aria-expanded on the textarea", async () => {
  const { editor } = openEditor();
  type(editor, "@");
  const options = within(suggestions() as HTMLElement).getAllByRole("option");
  expect(editor.getAttribute("aria-controls")).toBe(suggestions()?.id);
  expect(editor.hasAttribute("aria-expanded")).toBe(false);
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[0].id);

  fireEvent.keyDown(editor, { key: "ArrowDown" });
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[1].id);
  expect(options[1].getAttribute("aria-selected")).toBe("true");

  fireEvent.keyDown(editor, { key: "ArrowUp" });
  expect(editor.getAttribute("aria-activedescendant")).toBe(options[0].id);
});

it("DATA-001: Escape closes the suggestions before it cancels the edit", async () => {
  const { editor } = openEditor();
  type(editor, "Pairing with @al");
  fireEvent.keyDown(editor, { key: "Escape" });

  expect(suggestions()).toBeNull();
  expect(screen.getByRole("textbox", { name: "Description (Markdown)" })).toBe(editor);

  fireEvent.keyDown(editor, { key: "Escape" });
  expect(screen.queryByRole("textbox", { name: "Description (Markdown)" })).toBeNull();
});

it("REQ-035.4, REQ-035: unsaved description changes hold back closing the tab; an unchanged editor doesn't", () => {
  const { editor } = openEditor();

  const unchanged = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unchanged);
  expect(unchanged.defaultPrevented).toBe(false);

  type(editor, "Half a thought");
  const changed = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(changed);
  expect(changed.defaultPrevented).toBe(true);
});