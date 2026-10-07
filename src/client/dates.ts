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