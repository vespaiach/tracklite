"use server";

import * as v from "valibot";
import { createIssue as create } from "../../../../application/issues/create-issue";
import { moveIssue as move } from "../../../../application/issues/move-issue";
import { IssueId, ProjectKey, tryFrom } from "../../../../domain/shared/identifiers";
import { db } from "../../../../infrastructure/db";
import { issueWork } from "../../../../infrastructure/issues/issue-work";
import { updatedIssue } from "../../../../queries";
import { action } from "../../../_server/action";
import { IssueMove, NewIssue } from "../../../_server/schemas/issues";

const projectKey = v.pipe(
  v.string(),
  v.transform((key) => tryFrom(ProjectKey, key)),
);

const issueId = v.pipe(
  v.string(),
  v.transform((id) => tryFrom(IssueId, id)),
);

export const createIssue = action(
  "createIssue",
  "member",
  v.object({ ...NewIssue.entries, key: projectKey }),
  async (actor, { key, ...issue }) => {
    const { issueId } = await create(actor, issueWork, key, issue);
    return { id: (await updatedIssue(db, issueId)).id };
  },
);

export const moveIssue = action(
  "moveIssue",
  "member",
  v.object({ ...IssueMove.entries, id: issueId }),
  async (actor, { id, ...place }) => {
    await move(actor, issueWork, id, place);
    return null;
  },
);