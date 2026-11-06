"use client";

import { unstable_rethrow } from "next/navigation";
import { catchError, type ErrorInfo as RetryInfo } from "next/error";
import { Component, type ErrorInfo, type ReactNode, Suspense, useContext } from "react";
import { ErrorReporterContext, type ReportError } from "../../client/error-reporter";
import { Button, FormStatus, SettingsActions } from "../ui/track-lite";
import { DelayedFallback } from "./DelayedFallback";

export function Region({ what, children }: { what: string; children: ReactNode }) {
  const report = useContext(ErrorReporterContext);
  return (
    <RegionBoundary what={what}>
      <CrashReporter report={report}>
        <Suspense fallback={<DelayedFallback />}>{children}</Suspense>
      </CrashReporter>
    </RegionBoundary>
  );
}

const RegionBoundary = catchError(function RegionFailed({ what }: { what: string }, { retry }: RetryInfo) {
  return (
    <SettingsActions>
      <FormStatus>Couldn’t load {what}.</FormStatus>
      <Button
        size="sm"
        onClick={retry}>
        Try again
      </Button>
    </SettingsActions>
  );
});

type CrashReporterProps = { report: ReportError; children: ReactNode };

type CrashReporterState = { caught: boolean; forwarded?: unknown };

class CrashReporter extends Component<CrashReporterProps, CrashReporterState> {
  state: CrashReporterState = { caught: false };

  static getDerivedStateFromError(error: unknown) {
    unstable_rethrow(error);
    return { caught: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!isFromServer(error)) {
      this.props.report("zone-crashed", error, { component: firstComponent(info.componentStack) });
    }

    this.setState({ forwarded: error });
  }

  render() {
    if (this.state.forwarded !== undefined) throw this.state.forwarded;
    return this.state.caught ? null : this.props.children;
  }
}

function isFromServer(error: unknown) {
  return error instanceof Error && "digest" in error;
}

export function firstComponent(componentStack: string | null | undefined) {
  const line = (componentStack ?? "").split("\n").find((each) => each.trim() !== "");
  return line?.trim().match(/^(?:at\s+)?([^\s@(]+)/)?.[1];
}