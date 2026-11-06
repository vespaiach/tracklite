import type { Me } from "../../../contract";
import { profileResponse } from "../../../queries";
import { apiRoute } from "../_route";

export const GET = apiRoute("member", (_request, member) =>
  Response.json(profileResponse(member) satisfies Me),
);