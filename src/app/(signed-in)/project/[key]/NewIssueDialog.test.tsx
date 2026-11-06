import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ActionResult, IssueDraft, MemberSummary, ProjectSummary } from "../../../../contract";
import { renderForm } from "../../../../test/forms";
import { NewIssueButton } from "./NewIssueDialog";

afterEach(cleanup);

type Created = ActionResult<{ id: string }>;

const web: ProjectSummary = { key: "WEB", name: "Website", archivedAt: null };
const sam: MemberSummary = { username: "sam", fullName: "Sam Lee", initials: "SL", deactivated: false };
const alex: MemberSummary = { username: "alex", fullName: "Alex Kim", initials: "AK", deactivated: false };
const priya: MemberSummary = { username: "priya", fullName: "Priya Shah", initials: "PS", deactivated: true };

const created: Created = { ok: true, data: { id: "WEB-1" } };

function renderButton(...answers: (Created | Error | "pending")[]) {
  const createIssue = vi.fn(async (_draft: IssueDraft): Promise<Created> => {
    const answer = answers.shift() ?? created;
    if (answer === "pending") return new Promise(() => {});
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const onCreated = vi.fn();
  renderForm(
    <NewIssueButton
      project={web}
      members={[alex, priya, sam]}
      me="sam"
      createIssue={createIssue}
      onCreated={onCreated}
    />,
  );
  return { createIssue, onCreated };
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "New issue" }));
  return screen.getByRole("dialog", { name: "New issue" });
}

function typeTitle(dialog: HTMLElement, value: string) {
  const title = within(dialog).getByRole("textbox", { name: "Title" }) as HTMLInputElement;
  fireEvent.change(title, { target: { value } });
  return title;
}

function create(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
}

it("REQ-016.1, STD-5: creating an issue sends the title, no assignees and a request ID, then opens the new issue", async () => {
  const { createIssue, onCreated } = renderButton();

  const dialog = openDialog();
  typeTitle(dialog, "Fix login button");
  create(dialog);

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith("WEB-1"));
  const [[draft]] = createIssue.mock.calls;
  expect(draft).toEqual({
    key: "WEB",
    requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    title: "Fix login button",
    status: undefined,
    assignees: [],
  });
});

it("REQ-016.6: the chosen assignees, from active members only, are sent with the create", async () => {
  const { createIssue } = renderButton();

  const dialog = openDialog();
  typeTitle(dialog, "Fix login button");
  const assignees = within(dialog).getByRole("button", { name: /^Assignees/ });
  fireEvent.click(assignees);
  const listbox = await screen.findByRole("listbox");
  expect(
    within(listbox)
      .getAllByRole("option")
      .map((option) => option.getAttribute("data-key")),
  ).toEqual(["alex", "sam"]);
  fireEvent.click(within(listbox).getByRole("option", { name: /^Sam Lee/ }));
  fireEvent.click(within(listbox).getByRole("option", { name: /^Alex Kim/ }));
  await waitFor(() => expect(assignees.textContent).toContain("Alex Kim, Sam Lee"));

  fireEvent.keyDown(document.activeElement ?? listbox, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  create(dialog);

  await waitFor(() => expect(createIssue).toHaveBeenCalledOnce());
  expect(createIssue.mock.calls[0][0].assignees).toEqual(["sam", "alex"]);
});

it("REQ-016.3, STD-3: a title of only spaces gets Title required and keeps what was typed", async () => {
  renderButton({
    ok: false,
    error: { kind: "invalid", message: "Check the highlighted fields", fields: { title: "Title required" } },
  });

  const dialog = openDialog();
  const title = typeTitle(dialog, "   ");
  create(dialog);

  expect(await within(dialog).findByText("Title required")).toBeTruthy();
  expect(title.value).toBe("   ");
  expect(title.getAttribute("aria-invalid")).toBe("true");
});

it("REQ-013.4, STD-9: a refusal without fields shows its message as a toast", async () => {
  const { onCreated } = renderButton({
    ok: false,
    error: { kind: "forbidden", message: "This project is archived" },
  });

  const dialog = openDialog();
  typeTitle(dialog, "Fix login button");
  create(dialog);

  expect(await screen.findByText("This project is archived")).toBeTruthy();
  expect(onCreated).not.toHaveBeenCalled();
});

it("STD-5, STD-9: a failed create shows the toast and keeps the title; the retry reuses the requestId and shows Creating… disabled", async () => {
  const { createIssue, onCreated } = renderButton(new TypeError("Failed to fetch"), "pending");

  const dialog = openDialog();
  const title = typeTitle(dialog, "Fix login button");
  create(dialog);

  expect(await screen.findByText("Couldn’t save. Try again.")).toBeTruthy();
  expect(title.value).toBe("Fix login button");
  expect(onCreated).not.toHaveBeenCalled();

  create(dialog);

  const saving = await within(dialog).findByRole("button", { name: "Creating…" });
  expect((saving as HTMLButtonElement).disabled).toBe(true);
  const [[first], [second]] = createIssue.mock.calls;
  expect(second.requestId).toBe(first.requestId);
});