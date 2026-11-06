import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { createBrowserRouter, RouterProvider } from "react-router";
import type { CreateIssue } from "../app/(signed-in)/project/[key]/NewIssueDialog";
import { createBrowserErrorReporter, ErrorReporterContext, type ReportError } from "./error-reporter";
import { routes } from "./routes";
import { makeStore } from "./store";
import { Toaster } from "./Toaster";
import { CreateIssueContext } from "./useNewIssue";

export type ClientAppProps = { createIssue: CreateIssue };

export default function ClientApp({ createIssue }: ClientAppProps) {
  const [router] = useState(() => createBrowserRouter(routes));
  const [store] = useState(() => makeStore(router));
  const [report] = useState(createBrowserErrorReporter);
  useEffect(() => reportUncaughtErrors(report), [report]);
  return (
    <ErrorReporterContext value={report}>
      <CreateIssueContext value={createIssue}>
        <Provider store={store}>
          <RouterProvider router={router} />
          <Toaster />
        </Provider>
      </CreateIssueContext>
    </ErrorReporterContext>
  );
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