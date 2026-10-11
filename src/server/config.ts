const alwaysRequired = ["DATABASE_URL", "APP_URL", "EMAIL_FROM"] as const;
const requiredInProduction = ["EMAIL_API_KEY", "EMAIL_WEBHOOK_SECRET"] as const;

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const required =
    env.NODE_ENV === "production" ? [...alwaysRequired, ...requiredInProduction] : alwaysRequired;
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return {
    databaseUrl: env.DATABASE_URL as string,
    appUrl: env.APP_URL as string,
    emailFrom: env.EMAIL_FROM as string,
    emailApiKey: env.EMAIL_API_KEY,
    emailWebhookSecret: env.EMAIL_WEBHOOK_SECRET,
    mailpitHost: env.MAILPIT_HOST ?? "localhost",
    mailpitPort: env.MAILPIT_PORT ?? "8025",
  };
}