import { beforeEach, expect, it } from "vitest";
import { createToken } from "../tokens";
import { outbox } from "./outbox";
import { sendEmail } from "./send";
import { invitationEmail, passwordResetEmail } from "./templates";

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

it("spec §9: the invitation email matches the spec word for word", async () => {
  const token = createToken();

  await sendEmail({ to: "sam@acme.com", ...invitationEmail({ inviterName: "Alex Kim", token }) });

  expect(outbox.sent).toEqual([
    {
      to: "sam@acme.com",
      subject: "Alex Kim invited you to Tracklite",
      text: [
        "Alex Kim invited you to join their team on Tracklite.",
        "",
        `Accept the invitation: http://localhost:3000/invite?token=${token}`,
        "",
        "This link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.",
        "",
        "— Tracklite",
      ].join("\n"),
    },
  ]);
});