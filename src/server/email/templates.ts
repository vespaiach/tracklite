import "server-only";
import { readConfig } from "../config";

const signature = "\n\n— Tracklite";

export function passwordResetEmail({ email, token }: { email: string; token: string }) {
  return {
    subject: "Reset your Tracklite password",
    text:
      [
        `Someone asked to reset the password for ${email} on Tracklite.`,
        "",
        `Choose a new password: ${readConfig().appUrl}/reset-password?token=${token}`,
        "",
        "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password hasn't changed.",
      ].join("\n") + signature,
  };
}