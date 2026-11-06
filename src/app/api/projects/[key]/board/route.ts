import type { Board } from "../../../../../contract";
import { ProjectKey, tryFrom } from "../../../../../domain/shared/identifiers";
import { apiRoute } from "../../../../../server/shared/api-route";
import { getBoard } from "../../../../../queries";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/board">) {
  const key = tryFrom(ProjectKey, (await params).key);
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getBoard(member, key)) satisfies Board),
  )(request);
}