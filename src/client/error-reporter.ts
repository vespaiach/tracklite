import { createContext } from "react";

type ClientErrorEvent = "uncaught" | "page-crashed" | "zone-crashed";

type ReportExtra = { component?: string; digest?: string };

export type ReportError = (event: ClientErrorEvent, error: unknown, extra?: ReportExtra) => void;

type ReporterOptions = {
  fetch: typeof fetch;
  events: EventTarget;
  online: () => boolean;
  page: () => string;
  build: string | undefined;
  now: () => number;
  timeZone: string;
};

const hour = 60 * 60 * 1000;
const reportsPerHour = 20;

export const ErrorReporterContext = createContext<ReportError>(() => {});

export function createErrorReporter(options: ReporterOptions): ReportError {
  const seen = new Set<string>();
  const queue: string[] = [];
  let windowStart = options.now();

  function send(body: string) {
    try {
      options
        .fetch("/api/client-errors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        })
        .catch(() => {});
    } catch {}
  }

  function flush() {
    for (const body of queue.splice(0)) send(body);
  }

  function admit(key: string) {
    if (options.now() - windowStart >= hour) {
      windowStart = options.now();
      seen.clear();
    }

    if (seen.has(key) || seen.size >= reportsPerHour) return false;
    seen.add(key);
    return true;
  }

  options.events.addEventListener("online", flush);

  return (event, error, extra = {}) => {
    try {
      const { name, message, stack } = describe(error);
      if (!admit(`${message}\n${firstFrame(stack)}`)) return;

      const body = JSON.stringify({
        event,
        name: cut(name, 100),
        message: cut(message, 500),
        stack: stack === undefined ? undefined : cut(stack, 4000),
        page: cut(options.page(), 200),
        component: extra.component === undefined ? undefined : cut(extra.component, 200),
        digest: extra.digest === undefined ? undefined : cut(extra.digest, 100),
        build: options.build === undefined ? undefined : cut(options.build, 100),
        timeZone: cut(options.timeZone, 64),
        occurredAt: new Date(options.now()).toISOString(),
      });

      if (options.online()) send(body);
      else queue.push(body);
    } catch {}
  };
}

export function createBrowserErrorReporter() {
  return createErrorReporter({
    fetch: (input, init) => fetch(input, init),
    events: window,
    online: () => navigator.onLine,
    page: () => location.pathname,
    build: process.env.BUILD_ID,
    now: Date.now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function describe(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "Error", message: String(error), stack: undefined };
}

function firstFrame(stack: string | undefined) {
  const frames = (stack ?? "").split("\n").map((line) => line.trim());
  return frames.find((line) => line.startsWith("at ") || line.includes("@")) ?? "";
}

function cut(text: string, max: number) {
  return [...text].slice(0, max).join("");
}