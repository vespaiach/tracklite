import { createContext, use } from "react";
import { useNavigate } from "react-router";
import type { CreateIssue } from "../app/(signed-in)/project/[key]/NewIssueDialog";
import { useMeQuery, useMembersQuery } from "./api";

export const CreateIssueContext = createContext<CreateIssue>(async () => {
  throw new Error("No createIssue action");
});

export function useNewIssue() {
  const { data: members = [] } = useMembersQuery();
  const { data: me } = useMeQuery();
  const navigate = useNavigate();
  return {
    members,
    me: me?.username ?? "",
    createIssue: use(CreateIssueContext),
    onCreated: (id: string) => void navigate(`/issue/${id}`),
  };
}