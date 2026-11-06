import { createContext, use } from "react";
import type { CreateIssue } from "../app/(signed-in)/project/[key]/NewIssueDialog";
import { loadPage } from "../lib/load-page";
import { useMeQuery, useMembersQuery } from "./api";

export const CreateIssueContext = createContext<CreateIssue>(async () => {
  throw new Error("No createIssue action");
});

export function useNewIssue() {
  const { data: members = [] } = useMembersQuery();
  const { data: me } = useMeQuery();
  return {
    members,
    me: me?.username ?? "",
    createIssue: use(CreateIssueContext),
    onCreated: (id: string) => loadPage(`/issue/${id}`),
  };
}