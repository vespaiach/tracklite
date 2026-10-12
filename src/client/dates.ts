export function formatDate(iso: string, now = new Date()) {
  const date = new Date(iso);
  const thisYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: thisYear ? undefined : "numeric",
  });
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });

export function formatUpdated(iso: string, now = new Date()) {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < minute) return "just now";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} min ago`;
  if (elapsed < day) return relative.format(-Math.floor(elapsed / hour), "hour");
  if (elapsed < 7 * day) return relative.format(-Math.floor(elapsed / day), "day");
  return formatDate(iso, now);
}

export function formatExact(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
    timeZone,
  });
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function formatWait(seconds: number) {
  if (seconds < 60) return plural(seconds, "second");
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return plural(Math.floor(seconds / 3600), "hour");
  return plural(Math.floor(seconds / 86_400), "day");
}