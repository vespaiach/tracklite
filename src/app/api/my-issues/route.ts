import { apiRoute } from "../../../server/api-route";
import { getMyIssues } from "../../../server/issues";

export async function GET(request: Request) {
  return apiRoute("member", async (_request, member) => Response.json(await getMyIssues(member)))(request);
}