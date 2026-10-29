import { DrizzleQueryError } from "drizzle-orm";

type NoContext = Record<never, never>;

type MailEvent = { kind?: "notification" | "invitation" | "untracked"; id?: string };

type ClientError = {
  actor?: string;
  ip: string;
  browser: string;
  device: "desktop" | "mobile" | "tablet";
  userAgent: string;
  page: string;
  build?: string;
  component?: string;
  digest?: string;
  timeZone?: string;
  occurredAt: string;
};

type InfoEvents = {
  route: { request: { method: string; path: string; status: number; durationMs: number; actor?: string } };
  worker: {
    metrics: {
      pending: number;
      due: number;
      oldestDueSeconds: number;
      sent: number;
      failed: number;
      dropped: number;
    };
  };
  mail: { bounced: MailEvent; ignored: MailEvent };
};

type ErrorEvents = {
  route: {
    "request-failed": { method: string; path?: string; route?: string; actor?: string; digest?: string };
  };
  worker: {
    "delivery-failed": { deliveryId: string; channel: string };
    "pass-failed": NoContext;
    "metrics-failed": NoContext;
    "cleanup-failed": NoContext;
  };
  boot: { "start-failed": { script: string } };
  mail: {
    "fetch-failed": { host: string };
    "bad-status": { host: string; status: number };
    "bad-response": { host: string; fields: string[] };
  };
  client: { uncaught: ClientError; "page-crashed": ClientError; "zone-crashed": ClientError };
};

type ContextArg<Context> = NoContext extends Context ? [context?: Context] : [context: Context];

type LoggedError = {
  name: string;
  message: string;
  code?: string | number;
  stack?: string;
  cause?: LoggedError;
};

const maxMessageLength = 500;
const causeDepth = 2;

function writeLine(line: object) {
  console.error(JSON.stringify(line));
}

export function logInfo<Source extends keyof InfoEvents, Event extends keyof InfoEvents[Source]>(
  source: Source,
  event: Event,
  context: InfoEvents[Source][Event],
) {
  writeLine({ level: "info", time: new Date().toISOString(), source, event, ...(context as object) });
}

export function logError<Source extends keyof ErrorEvents, Event extends keyof ErrorEvents[Source]>(
  source: Source,
  event: Event,
  error: unknown,
  ...[context]: ContextArg<ErrorEvents[Source][Event]>
) {
  writeLine({
    level: "error",
    time: new Date().toISOString(),
    source,
    event,
    ...(context as object | undefined),
    error: loggedError(error, 0),
  });
}

function loggedError(error: unknown, depth: number): LoggedError {
  if (typeof error !== "object" || error === null) {
    return { name: "Error", message: shownMessage(String(error)) };
  }

  const { name, message, code, stack, cause } = error as Record<string, unknown>;
  const rawMessage = typeof message === "string" ? message : "";
  const safeMessage = error instanceof DrizzleQueryError ? "query failed" : shownMessage(rawMessage);

  return {
    name: typeof name === "string" ? name : "Error",
    message: safeMessage,
    code: typeof code === "string" || typeof code === "number" ? code : undefined,
    stack: typeof stack === "string" ? maskEmails(stack.replace(rawMessage, safeMessage)) : undefined,
    cause: cause !== undefined && depth < causeDepth ? loggedError(cause, depth + 1) : undefined,
  };
}

function shownMessage(message: string) {
  return maskEmails(message).slice(0, maxMessageLength);
}

function maskEmails(text: string) {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");
}

export function logEmailFailure(line: { status: number; errorName?: string }) {
  writeLine({ time: new Date().toISOString(), level: "error", event: "email", ...line });
}

export function logNotificationFailure({ channel, deliveryId }: { channel: string; deliveryId: string }) {
  writeLine({
    time: new Date().toISOString(),
    level: "error",
    event: "notification",
    message: `${channel} failed`,
    deliveryId,
  });
}

export function logNotificationError({ deliveryId, errorName }: { deliveryId?: string; errorName: string }) {
  writeLine({
    time: new Date().toISOString(),
    level: "error",
    event: "notification",
    message: "unexpected error",
    deliveryId,
    errorName,
  });
}