import { useContext, useEffect, useState } from "react";
import { useRouteError } from "react-router";
import { Button } from "../components/ui/track-lite";
import { ErrorReporterContext, type ReportError } from "./error-reporter";

const countdownSeconds = 60;
const crashWindow = 10 * 60 * 1000;
const crashesBeforeManualReload = 3;
const crashesKey = "tracklite.crashes";

type CrashScreenProps = { error: unknown; report: ReportError; reload?: () => void };

export function CrashScreen({ error, report, reload = reloadPage }: CrashScreenProps) {
  const [autoReload] = useState(() => recordCrash() < crashesBeforeManualReload);
  const [seconds, setSeconds] = useState(countdownSeconds);

  useEffect(() => report("page-crashed", error, { digest: digestOf(error) }), [report, error]);

  useEffect(() => {
    if (!autoReload) return;
    const timer = setInterval(() => setSeconds((left) => Math.max(left - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [autoReload]);

  useEffect(() => {
    if (seconds === 0) reload();
  }, [seconds, reload]);

  return (
    <main className="tl-page-message">
      <h1 className="tl-page-message__title">Something went wrong</h1>
      <p>{autoReload ? `Reloading in ${seconds} s.` : "Reload to try again."}</p>
      <p>
        <Button
          variant="primary"
          onClick={reload}>
          Reload
        </Button>
      </p>
    </main>
  );
}

export function RouteCrashScreen() {
  return (
    <CrashScreen
      error={useRouteError()}
      report={useContext(ErrorReporterContext)}
    />
  );
}

function reloadPage() {
  window.location.reload();
}

function recordCrash() {
  try {
    const now = Date.now();
    const stored: unknown = JSON.parse(sessionStorage.getItem(crashesKey) ?? "[]");
    const recent = (Array.isArray(stored) ? stored : []).filter(
      (time): time is number => typeof time === "number" && now - time < crashWindow,
    );
    sessionStorage.setItem(crashesKey, JSON.stringify([...recent, now]));
    return recent.length + 1;
  } catch {
    return 1;
  }
}

function digestOf(error: unknown) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" ? digest : undefined;
}