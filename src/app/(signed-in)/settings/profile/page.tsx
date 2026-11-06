import { profileResponse } from "../../../../queries";
import { signedInPageMember } from "../../../_server/session";
import { changePassword, updateProfile } from "./actions";
import { Profile } from "./Profile";

export default async function ProfilePage() {
  const member = await signedInPageMember();

  return (
    <Profile
      me={profileResponse(member)}
      updateProfile={updateProfile}
      changePassword={changePassword}
    />
  );
}