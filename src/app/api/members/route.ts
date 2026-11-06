import type { Me, MemberSummary } from "../../../contract";
import { listMembers } from "../../../queries";
import { apiRoute } from "../_route";

export const GET = apiRoute("member", async (_request, member) =>
  Response.json((await listMembers(member)) satisfies (Me | MemberSummary)[]),
);