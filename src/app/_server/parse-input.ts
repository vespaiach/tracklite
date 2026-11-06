import * as v from "valibot";
import { DomainError } from "../../domain/shared/domain-error";

type ValidationIssues = [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]];

export function unreadableInput() {
  return new DomainError("invalid", "Couldn’t read the request.");
}

export function parseInput<Schema extends v.GenericSchema>(schema: Schema, input: unknown) {
  const result = v.safeParse(schema, input, { abortPipeEarly: true });
  if (result.success) return result.output as v.InferOutput<Schema>;

  throw inputError(result.issues);
}

function inputError(issues: ValidationIssues) {
  const { root, nested } = v.flatten(withRequiredMessages(issues));
  if (root) return new DomainError("invalid", root[0]);
  if (!nested) return unreadableInput();
  const fields = Object.fromEntries(
    Object.entries(nested).flatMap(([field, messages]) => (messages ? [[field, messages[0]]] : [])),
  );
  return new DomainError("invalid", "Check the highlighted fields", fields);
}

function withRequiredMessages(issues: ValidationIssues) {
  return issues.map((issue) =>
    issue.type === "object" && issue.input === undefined ? { ...issue, message: "Required" } : issue,
  ) as ValidationIssues;
}