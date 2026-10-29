import type { Instrumentation } from "next";
import { readConfig } from "./server/shared/config";
import { logError } from "./server/shared/log";

export function register() {
  readConfig();
}

export const onRequestError: Instrumentation.onRequestError = (error, { method }, { routePath }) => {
  logError("route", "request-failed", error, { method, route: routePath, digest: digestOf(error) });
};

function digestOf(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" ? digest : undefined;
}