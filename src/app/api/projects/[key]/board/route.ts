import type { Board } from "../../../../../contract";
import { apiRoute } from "../../../../../server/shared/api-route";
import { getBoard } from "../../../../../server/issues";

export async function GET(request: Request, { params }: RouteContext<"/api/projects/[key]/board">) {
  const { key } = await params;
  return apiRoute("member", async (_memberRequest, member) =>
    Response.json((await getBoard(member, key)) satisfies Board),
  )(request);
}