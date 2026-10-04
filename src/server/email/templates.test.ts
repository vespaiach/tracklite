import { beforeEach, expect, it } from "vitest";
import { createToken } from "../tokens";
import { outbox } from "./outbox";
import { sendEmail } from "./send";
import { passwordResetEmail } from "./templates";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

it("spec §9: the password reset email matches the spec word for word", async () => {
  const token = createToken();

  await sendEmail({ to: "sam@acme.com", ...passwordResetEmail({ email: "sam@acme.com", token }) });

  expect(outbox.sent).toEqual([
    {
      to: "sam@acme.com",
      subject: "Reset your Tracklite password",
      text: [
        "Someone asked to reset the password for sam@acme.com on Tracklite.",
        "",
        `Choose a new password: http://localhost:3000/reset-password?token=${token}`,
        "",
        "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password hasn't changed.",
        "",
        "— Tracklite",
      ].join("\n"),
    },
  ]);
});