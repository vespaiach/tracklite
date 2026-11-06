import { sendEmail } from "../src/infrastructure/email/send";
import { passwordResetEmail } from "../src/infrastructure/email/templates";
import { createToken } from "../src/infrastructure/tokens";
import { logError } from "../src/infrastructure/log";

const to = process.argv[2] ?? "sam@acme.com";
try {
  const sent = await sendEmail({ to, ...passwordResetEmail({ email: to, token: createToken() }) });
  if (sent.ok)
    console.log(`Sent a password reset email to ${to} (message ID ${sent.value.providerMessageId})`);
  else process.exitCode = 1;
} catch (error) {
  logError("boot", "start-failed", error, { script: "send-dev-email" });
  process.exitCode = 1;
}