export function returnTarget(next: string | null) {
  if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return "/my-issues";
}