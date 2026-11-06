import { updateProfile } from "../../../application/identity/update-profile";
import type { Me } from "../../../contract";
import { Username } from "../../../domain/shared/identifiers";
import { identityWork } from "../../../infrastructure/identity/repositories";
import { memberProfile, profileResponse } from "../../../queries";
import { ProfileChanges } from "../../_server/schemas/identity";
import { apiRoute } from "../../../server/shared/api-route";

export const GET = apiRoute("member", (_request, member) =>
  Response.json(profileResponse(member) satisfies Me),
);

export const PATCH = apiRoute("member", ProfileChanges, async (_request, member, changes) => {
  await updateProfile(member, identityWork, changes);
  return Response.json((await memberProfile(Username.from(member.username))) satisfies Me);
});