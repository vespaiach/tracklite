import type { MemberSummary } from "./members";

export type ThreadComment = {
  id: string;
  body: string;
  author: MemberSummary;
  createdAt: string;
  editedAt: string | null;
  version: number;
  mentions: MemberSummary[];
};