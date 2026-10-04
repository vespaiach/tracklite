type RequestLogLine = {
  level: "info" | "error";
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
};

export function logRequest(line: RequestLogLine) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event: "request", ...line }));
}