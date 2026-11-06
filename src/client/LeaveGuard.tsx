import { use } from "react";
import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import { useLeaveGuard } from "../components/leave-guard";
import { Button, Dialog } from "../components/ui/track-lite";

export function LeaveGuard({ unsaved, message }: { unsaved: boolean; message: string }) {
  useLeaveGuard(unsaved ? message : null);

  return (
    use(UNSAFE_DataRouterContext) && (
      <RouterLeaveGuard
        unsaved={unsaved}
        message={message}
      />
    )
  );
}

function RouterLeaveGuard({ unsaved, message }: { unsaved: boolean; message: string }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname,
  );

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