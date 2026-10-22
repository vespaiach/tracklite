import type { Board } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { parseProjectKey } from "../../../../../server/projects";
import { getBoard } from "../../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/board">) {
  const key = parseProjectKey((await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getBoard(member, key)) satisfies Board),
  )(request);
}