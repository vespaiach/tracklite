import "server-only";
import * as v from "valibot";
import { issuePriorities, issueStatuses } from "../contract";
import { maxCharacters, requestId } from "./common";
import { descriptionText, descriptionVersion } from "./description";

const maxTitleLength = 200;
const maxLabels = 10;
const editableFields = ["title", "status", "priority", "assignee", "labelIds"];

const title = v.pipe(
  v.string("Title required"),
  v.trim(),
  v.nonEmpty("Title required"),
  maxCharacters(maxTitleLength, `Too long (max ${maxTitleLength})`),
);
const status = v.picklist(issueStatuses, "Choose a status");

export const NewIssue = v.object({
  requestId,
  title,
  status: v.optional(v.fallback(v.picklist(issueStatuses), "backlog"), "backlog"),
});
export type NewIssue = v.InferOutput<typeof NewIssue>;

function isDescriptionSave(body: Record<string, unknown>) {
  return "description" in body || "descriptionVersion" in body;
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
    assignee: v.optional(v.nullable(v.pipe(v.string("Choose an active member"), v.toLowerCase()))),
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
  place: v.union([v.literal("top"), v.literal("bottom"), v.object({ after: v.string() })], "Choose a place"),
});
export type IssueMove = v.InferOutput<typeof IssueMove>;