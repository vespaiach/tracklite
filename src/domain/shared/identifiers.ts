import * as v from "valibot";

const issueId = v.pipe(
  v.string(),
  v.regex(/^[A-Za-z]{2,5}-[1-9]\d{0,8}$/),
  v.toUpperCase(),
  v.brand("IssueId"),
);

export type IssueId = v.InferOutput<typeof issueId>;

export function parseIssueId(text: string): IssueId | undefined {
  const result = v.safeParse(issueId, text);
  return result.success ? result.output : undefined;
}

const projectKeyRule = "Key must be 2 to 5 letters";

export const projectKey = v.pipe(
  v.string(projectKeyRule),
  v.regex(/^[A-Za-z]{2,5}$/, projectKeyRule),
  v.toUpperCase(),
  v.brand("ProjectKey"),
);

export type ProjectKey = v.InferOutput<typeof projectKey>;

export function parseProjectKey(text: string): ProjectKey | undefined {
  const result = v.safeParse(projectKey, text);
  return result.success ? result.output : undefined;
}