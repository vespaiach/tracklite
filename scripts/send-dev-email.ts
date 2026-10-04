import { sendEmail } from "../src/server/email/send";
import { passwordResetEmail } from "../src/server/email/templates";
import { createToken } from "../src/server/tokens";

const to = process.argv[2] ?? "sam@acme.com";
const { providerMessageId } = await sendEmail({
  to,
  ...passwordResetEmail({ email: to, token: createToken() }),
});
console.log(`Sent a password reset email to ${to} (Mailpit ID ${providerMessageId})`);