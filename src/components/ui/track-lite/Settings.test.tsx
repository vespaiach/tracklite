import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsEmpty } from "./Settings";

afterEach(cleanup);

it("SettingsEmpty's action is a button after the note", () => {
  const onAction = vi.fn();
  render(
    <SettingsEmpty
      action="Create one."
      onAction={onAction}>
      No labels yet.
    </SettingsEmpty>,
  );

  const action = screen.getByRole("button", { name: "Create one." });
  expect(action.closest("p")?.textContent).toBe("No labels yet. Create one.");
  fireEvent.click(action);

  expect(onAction).toHaveBeenCalledOnce();
});