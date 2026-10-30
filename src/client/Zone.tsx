import { Component, type ErrorInfo, type ReactNode, useContext } from "react";
import { Button, FormStatus, SettingsActions, SettingsLayout } from "../components/ui/track-lite";
import { ErrorReporterContext, type ReportError } from "./error-reporter";
import { useShowLoading } from "./useShowLoading";

export type ZoneState<T> = { status: "loading" } | { status: "failed" } | { status: "ready"; data: T };

export function zoneState<T>({ data, isError }: { data?: T; isError: boolean }): ZoneState<T> {
  if (data !== undefined) return { status: "ready", data };
  return isError ? { status: "failed" } : { status: "loading" };
}

type ZoneProps<T> = {
  what: string;
  state: ZoneState<T>;
  retry: () => void;
  page?: boolean;
  children: (data: T) => ReactNode;
};

export function Zone<T>({ what, state, retry, page, children }: ZoneProps<T>) {
  const report = useContext(ErrorReporterContext);
  const showLoading = useShowLoading(state.status === "loading");
  const frame = (view: ReactNode) => (page ? <SettingsLayout>{view}</SettingsLayout> : view);

  if (state.status === "loading") return frame(showLoading && <FormStatus>Loading…</FormStatus>);

  const failed = (onRetry: () => void) =>
    frame(
      <ZoneFailed
        what={what}
        onRetry={onRetry}
      />,
    );
  if (state.status === "failed") return failed(retry);

  return (
    <ZoneBoundary
      resetOn={state.data}
      report={report}
      failed={(reset) =>
        failed(() => {
          reset();
          retry();
        })
      }>
      {children(state.data)}
    </ZoneBoundary>
  );
}

function ZoneFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <SettingsActions>
      <FormStatus>Couldn’t load {what}.</FormStatus>
      <Button
        size="sm"
        onClick={onRetry}>
        Try again
      </Button>
    </SettingsActions>
  );
}

type BoundaryProps = {
  resetOn: unknown;
  report: ReportError;
  failed: (reset: () => void) => ReactNode;
  children: ReactNode;
};

class ZoneBoundary extends Component<BoundaryProps, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.report("zone-crashed", error, { component: firstComponent(info.componentStack) });
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.crashed && previous.resetOn !== this.props.resetOn) this.reset();
  }

  reset = () => this.setState({ crashed: false });

  render() {
    return this.state.crashed ? this.props.failed(this.reset) : this.props.children;
  }
}

function firstComponent(componentStack: string | null | undefined) {
  const line = (componentStack ?? "").split("\n").find((each) => each.trim() !== "");
  return line?.trim().match(/^(?:at\s+)?([^\s@(]+)/)?.[1];
}