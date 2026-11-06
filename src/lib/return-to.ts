export function isInAppPath(path: string | null | undefined): path is string {
  return path?.startsWith("/") === true && !path.startsWith("//") && !path.startsWith("/\\");
}

export function returnTarget(next: string | null) {
  return isInAppPath(next) ? next : "/my-issues";
}