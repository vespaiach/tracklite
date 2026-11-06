"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createBrowserErrorReporter, ErrorReporterContext, type ReportError } from "../client/error-reporter";

export function ErrorReporting({ children }: { children: ReactNode }) {
  const [report] = useState<ReportError>(() =>
    typeof window === "undefined" ? () => {} : createBrowserErrorReporter(),
  );

  useEffect(() => reportUncaughtErrors(report), [report]);

  return <ErrorReporterContext value={report}>{children}</ErrorReporterContext>;
}

function reportUncaughtErrors(report: ReportError) {
  const onError = (event: ErrorEvent) => report("uncaught", event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => report("uncaught", event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}