type RequestLogLine = {
  level: "info" | "error";
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
  actor?: string;
};

export function logRequest(line: RequestLogLine) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "request", ...line }));
}

export function logEmailFailure(line: { status: number; errorName?: string }) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level: "error", event: "email", ...line }));
}

export function logEmailBounce(message: string) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level: "info", event: "email", message }));
}

export function logNotificationFailure({ channel, deliveryId }: { channel: string; deliveryId: string }) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      event: "notification",
      message: `${channel} failed`,
      deliveryId,
    }),
  );
}

export function logNotificationError({ deliveryId, errorName }: { deliveryId?: string; errorName: string }) {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      event: "notification",
      message: "unexpected error",
      deliveryId,
      errorName,
    }),
  );
}