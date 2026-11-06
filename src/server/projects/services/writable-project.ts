import { DomainError } from "../../shared/domain-error";

export function assertWritable(project: { archivedAt: Date | null }) {
  if (project.archivedAt !== null) throw new DomainError("forbidden", "This project is archived");
}