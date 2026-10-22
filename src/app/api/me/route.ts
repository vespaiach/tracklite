import type { Me } from "../../../contract";
import { ProfileChanges, profileResponse, updateProfile } from "../../../server/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", (_request, member) =>
  Response.json(profileResponse(member) satisfies Me),
);

export const PATCH = apiRoute("member", ProfileChanges, async (_request, member, changes) =>
  Response.json(profileResponse(await updateProfile(member, changes)) satisfies Me),
);