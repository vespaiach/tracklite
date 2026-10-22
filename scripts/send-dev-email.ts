import { sendEmail } from "../src/server/shared/email/send";
import { passwordResetEmail } from "../src/server/shared/email/templates";
import { createToken } from "../src/server/shared/tokens";

const to = process.argv[2] ?? "sam@acme.com";
const { providerMessageId } = await sendEmail({
  to,
  ...passwordResetEmail({ email: to, token: createToken() }),
});
console.log(`Sent a password reset email to ${to} (message ID ${providerMessageId})`);