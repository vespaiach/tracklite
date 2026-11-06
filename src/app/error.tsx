"use client";

import { useContext } from "react";
import { CrashScreen } from "../client/CrashScreen";
import { ErrorReporterContext } from "../client/error-reporter";

export default function PageError({ error }: { error: Error & { digest?: string } }) {
  return (
    <CrashScreen
      error={error}
      report={useContext(ErrorReporterContext)}
    />
  );
}