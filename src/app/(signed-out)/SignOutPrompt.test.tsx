import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { answering, renderForm } from "../../test/forms";
import { SignOutPrompt } from "./SignOutPrompt";

afterEach(cleanup);

it("REQ-050.8, REQ-002.3: the prompt shows its text and Sign out calls the sign-out action", async () => {
  const signOut = answering();
  renderForm(
    <SignOutPrompt
      text="You're signed in as Alex Kim. Sign out to reset a password."
      signOut={signOut}
    />,
  );

  expect(screen.getByText("You're signed in as Alex Kim. Sign out to reset a password.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
});