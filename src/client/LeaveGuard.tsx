import { useEffect } from "react";
import { useBlocker } from "react-router";
import { Button, Dialog } from "../components/ui/track-lite";

export function LeaveGuard({ unsaved, message }: { unsaved: boolean; message: string }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  return (
    blocker.state === "blocked" && (
      <Dialog
        open
        role="alertdialog"
        title={message}
        onClose={blocker.reset}
        actions={
          <>
            <Button onClick={blocker.reset}>Cancel</Button>
            <Button
              variant="danger"
              onClick={blocker.proceed}>
              Leave
            </Button>
          </>
        }
      />
    )
  );
}