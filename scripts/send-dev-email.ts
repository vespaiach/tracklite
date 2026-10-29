import { sendEmail } from "../src/server/shared/email/send";
import { passwordResetEmail } from "../src/server/shared/email/templates";
import { createToken } from "../src/server/shared/tokens";
import { logError } from "../src/server/shared/log";

const to = process.argv[2] ?? "sam@acme.com";
try {
  const sent = await sendEmail({ to, ...passwordResetEmail({ email: to, token: createToken() }) });
  if (sent.ok) console.log(`Sent a password reset email to ${to} (message ID ${sent.value.providerMessageId})`);
  else process.exitCode = 1;
} catch (error) {
  logError("boot", "start-failed", error, { script: "send-dev-email" });
  process.exitCode = 1;
}