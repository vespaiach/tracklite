import "server-only";
import * as v from "valibot";
import { issueStatuses } from "../../../contract";
import { IssuePriority } from "../../../domain/issues/issue-priority";
import { IssueStatus } from "../../../domain/issues/issue-status";
import { IssueTitle } from "../../../domain/issues/issue-title";
import { IssueId, RequestId, tryFrom, Username } from "../../../domain/shared/identifiers";
import { descriptionText, descriptionVersion } from "../../../server/shared/schemas";

const maxLabels = 10;
const editableFields = ["title", "status", "priority", "assignees", "labelIds"];
const descriptionFields = ["description", "descriptionVersion"];

const assignees = v.pipe(
  v.custom<string[]>(
    (input) => Array.isArray(input) && input.every((username) => tryFrom(Username, username) !== undefined),
    "Choose an active member",
  ),
  v.transform((usernames) =>
    [...new Set(usernames.map((username) => username.toLowerCase()))].map(Username.from),
  ),
);

export const NewIssue = v.object({
  requestId: RequestId.schema,
  title: IssueTitle.schema,
  status: v.pipe(
    v.optional(v.fallback(v.picklist(issueStatuses), "backlog"), "backlog"),
    v.transform((status) => IssueStatus.from(status)),
  ),
  assignees: v.optional(assignees, []),
});

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
    title: v.optional(IssueTitle.schema),
    status: v.optional(IssueStatus.schema),
    priority: v.optional(IssuePriority.schema),
    assignees: v.optional(assignees),
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

export const IssueMove = v.object({
  status: IssueStatus.schema,
  place: v.union(
    [
      v.literal("top"),
      v.literal("bottom"),
      v.object({
        after: v.pipe(
          v.string(),
          v.transform((after) => tryFrom(IssueId, after)),
        ),
      }),
    ],
    "Choose a place",
  ),
});