import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { createBrowserRouter, RouterProvider } from "react-router";
import { createBrowserErrorReporter, ErrorReporterContext, type ReportError } from "./error-reporter";
import { routes } from "./routes";
import { makeStore } from "./store";
import { Toaster } from "./Toaster";

export default function ClientApp() {
  const [router] = useState(() => createBrowserRouter(routes));
  const [store] = useState(() => makeStore(router));
  const [report] = useState(createBrowserErrorReporter);
  useEffect(() => reportUncaughtErrors(report), [report]);
  return (
    <ErrorReporterContext value={report}>
      <Provider store={store}>
        <RouterProvider router={router} />
        <Toaster />
      </Provider>
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