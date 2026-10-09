import type { Me } from "../../../client/api";
import { ProfileChanges } from "../../../schemas/profile";
import { apiRoute } from "../../../server/api-route";
import { profileResponse } from "../../../server/members";
import { updateProfile } from "../../../server/profile";

export const GET = apiRoute("member", (_request, member) =>
  Response.json(profileResponse(member) satisfies Me),
);

export const PATCH = apiRoute("member", ProfileChanges, async (_request, member, changes) =>
  Response.json(profileResponse(await updateProfile(member, changes)) satisfies Me),
);