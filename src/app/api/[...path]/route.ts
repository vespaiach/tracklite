import { ApiError } from "../../../server/api-error";
import { apiRoute } from "../../../server/api-route";

const signedOut = apiRoute(() => {
  throw new ApiError(401, "Sign in to continue.");
});

export { signedOut as DELETE, signedOut as GET, signedOut as PATCH, signedOut as POST, signedOut as PUT };