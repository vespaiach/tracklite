"use server";

import * as v from "valibot";
import type { IssueListPage } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { listIssues } from "../../../../../queries";
import { actionMember } from "../../../../_server/session";

const MorePage = v.object({
  key: v.string(),
  query: v.string(),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export async function moreIssues(more: unknown): Promise<IssueListPage> {
  const member = await actionMember();
  const { key, query, offset } = v.parse(MorePage, more);

  const params = new URLSearchParams(query);
  params.set("offset", String(offset));
  return listIssues(member, tryFrom(ProjectKey, key), params);
}