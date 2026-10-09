export type Me = {
  username: string;
  fullName: string;
  initials: string;
  deactivated: boolean;
  email: string;
  role: "admin" | "member";
};

export type MemberSummary = Pick<Me, "username" | "fullName" | "initials" | "deactivated">;

export type Invitation = {
  id: string;
  email: string;
  state: "pending" | "bounced" | "expired";
  expiresAt: string;
  invitedBy: MemberSummary;
};

export type InvitationLookup = { email: string };