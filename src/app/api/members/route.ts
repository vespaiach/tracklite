import { apiRoute } from "../../../server/api-route";
import { listMembers } from "../../../server/members";

export const GET = apiRoute("member", async (_request, member) => Response.json(await listMembers(member)));