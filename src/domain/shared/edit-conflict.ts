import { DomainError } from "./domain-error";

export function editConflict(editorName: string | undefined) {
  return new DomainError(
    "conflict",
    `This was changed by ${editorName ?? "someone else"}. Copy your text and reload.`,
  );
}