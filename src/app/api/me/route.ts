import { apiRoute } from "../../../server/api-route";
import { profileResponse } from "../../../server/members";
import { updateProfile } from "../../../server/profile";

export const GET = apiRoute("member", (_request, member) => Response.json(profileResponse(member)));

export const PATCH = apiRoute("member", async (request, member) => {
  const changes: Record<string, unknown> = await request.json();
  return Response.json(profileResponse(await updateProfile(member, changes)));
});