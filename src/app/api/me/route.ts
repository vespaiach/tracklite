import { apiRoute } from "../../../server/api-route";
import { profileResponse } from "../../../server/members";

export const GET = apiRoute("member", (_request, member) => Response.json(profileResponse(member)));