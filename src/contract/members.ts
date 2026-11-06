export const roles = ["admin", "member"] as const;

export type Role = (typeof roles)[number];

export type Me = {
  username: string;
  fullName: string;
  initials: string;
  deactivated: boolean;
  email: string;
  role: Role;
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