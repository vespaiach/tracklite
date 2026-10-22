import "server-only";
import * as v from "valibot";
import { issuePriorities, issueStatuses } from "../../contract";
import { maxCharacters, requestId } from "../shared/schemas";
import { descriptionText, descriptionVersion } from "../notifications";
import { usernameFormat } from "../identity";

const maxTitleLength = 200;
const maxLabels = 10;
const editableFields = ["title", "status", "priority", "assignee", "labelIds"];
const descriptionFields = ["description", "descriptionVersion"];

const title = v.pipe(
  v.string("Title required"),
  v.trim(),
  v.nonEmpty("Title required"),
  maxCharacters(maxTitleLength, `Too long (max ${maxTitleLength})`),
);
const status = v.picklist(issueStatuses, "Choose a status");

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

export const NewIssue = v.object({
  requestId,
  title,
  status: v.optional(v.fallback(v.picklist(issueStatuses), "backlog"), "backlog"),
});
export type NewIssue = v.InferOutput<typeof NewIssue>;

function isDescriptionSave(body: Record<string, unknown>) {
  const keys = Object.keys(body);
  return keys.length > 0 && keys.every((key) => descriptionFields.includes(key));
}

function isOneField(body: Record<string, unknown>) {
  const keys = Object.keys(body);
  return keys.length === 1 && editableFields.includes(keys[0]);
}

export const IssueChange = v.pipe(
  v.looseObject({}),
  v.check((body) => isDescriptionSave(body) || isOneField(body), "Change one field at a time"),
  v.object({
    title: v.optional(title),
    status: v.optional(status),
    priority: v.optional(v.picklist(issuePriorities, "Choose a priority")),
    assignee: v.optional(v.nullable(usernameFormat("Choose an active member"))),
    labelIds: v.optional(
      v.pipe(
        v.custom<string[]>(
          (input) => Array.isArray(input) && input.every((labelId) => typeof labelId === "string"),
          "Choose labels",
        ),
        v.transform((labelIds) => [...new Set(labelIds.map((labelId) => labelId.toLowerCase()))]),
        v.maxLength(maxLabels, `Maximum ${maxLabels} labels`),
      ),
    ),
    description: v.optional(descriptionText),
    descriptionVersion: v.optional(descriptionVersion),
  }),
  v.forward(
    v.partialCheck(
      [["description"], ["descriptionVersion"]],
      (change) => change.description === undefined || change.descriptionVersion !== undefined,
      "Version required",
    ),
    ["descriptionVersion"],
  ),
  v.forward(
    v.partialCheck(
      [["description"], ["descriptionVersion"]],
      (change) => change.descriptionVersion === undefined || change.description !== undefined,
      "Description required",
    ),
    ["description"],
  ),
);
export type IssueChange = v.InferOutput<typeof IssueChange>;

export const IssueMove = v.object({
  status,
  place: v.union(
    [
      v.literal("top"),
      v.literal("bottom"),
      v.object({ after: v.pipe(v.string(), v.transform(parseIssueId)) }),
    ],
    "Choose a place",
  ),
});
export type IssueMove = v.InferOutput<typeof IssueMove>;