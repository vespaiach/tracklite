const alwaysRequired = ["DATABASE_URL", "APP_URL", "EMAIL_FROM"] as const;
const requiredInProduction = ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "CRON_SECRET"] as const;
const minSecretLength = 32;

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const required =
    env.NODE_ENV === "production" ? [...alwaysRequired, ...requiredInProduction] : alwaysRequired;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  const setupSecret = optionalSecret(env, "SETUP_SECRET");
  const cronSecret = optionalSecret(env, "CRON_SECRET");

  return {
    databaseUrl: env.DATABASE_URL as string,
    appUrl: env.APP_URL as string,
    emailFrom: env.EMAIL_FROM as string,
    resendApiKey: env.RESEND_API_KEY,
    resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
    mailpitHost: env.MAILPIT_HOST ?? "localhost",
    mailpitPort: env.MAILPIT_PORT ?? "8025",
    setupSecret,
    cronSecret,
  };
}

function optionalSecret(env: NodeJS.ProcessEnv, name: "SETUP_SECRET" | "CRON_SECRET") {
  const secret = env[name] || undefined;
  if (secret !== undefined && [...secret].length < minSecretLength) {
    throw new Error(`${name} must be at least ${minSecretLength} characters`);
  }
  return secret;
}