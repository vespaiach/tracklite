"use client";

import { Ellipsis } from "lucide-react";
import { useState } from "react";
import { formatDate } from "../../../../client/dates";
import { Link } from "../../../../components/leave-guard";
import {
  Avatar,
  Button,
  Dialog,
  Field,
  FormStatus,
  Input,
  Menu,
  MenuItem,
  MenuSep,
  Mono,
  SettingsActions,
  SettingsEmpty,
  SettingsForm,
  SettingsInline,
  SettingsLayout,
  SettingsSection,
  Table,
  Tag,
} from "../../../../components/ui/track-lite";
import { useActionCall } from "../../../../components/useActionCall";
import { useFormAction } from "../../../../components/useFormAction";
import type { ActionResult, Invitation, Me } from "../../../../contract";

type MemberChange = { username: string; role?: Me["role"]; deactivated?: boolean };

export type MembersActions = {
  createInvitation: (form: FormData) => Promise<ActionResult<Invitation>>;
  resendInvitation: (invitation: { id: string }) => Promise<ActionResult<Invitation>>;
  revokeInvitation: (invitation: { id: string }) => Promise<ActionResult<null>>;
  updateMember: (change: MemberChange) => Promise<ActionResult<null>>;
};

type MembersProps = MembersActions & { you: string; members: Me[]; invitations: Invitation[] };

export function Members({ you, members, invitations, ...actions }: MembersProps) {
  return (
    <SettingsLayout wide>
      <MembersSection
        members={members}
        you={you}
        updateMember={actions.updateMember}
      />
      <InvitationsSection
        invitations={invitations}
        {...actions}
      />
    </SettingsLayout>
  );
}

function InviteForm({ createInvitation }: Pick<MembersActions, "createInvitation">) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const { error, submit, pending } = useFormAction(
    createInvitation,
    (invitation) => {
      setEmail("");
      setSentTo(invitation.email);
    },
    ["invalid"],
  );

  return (
    <SettingsForm
      aria-label="Invite by email"
      onSubmit={(event) => {
        setSentTo(undefined);
        submit(event);
      }}>
      <SettingsInline>
        <Field
          label="Email"
          help={
            <>
              The link works once and expires after <Mono>7</Mono> days.
            </>
          }
          error={error ? (error.fields?.email ?? error.message) : undefined}>
          {(props) => (
            <Input
              {...props}
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <SettingsActions>
          <Button
            variant="primary"
            type="submit"
            disabled={pending}
            aria-busy={pending || undefined}>
            {pending ? "Sending…" : "Send invitation"}
          </Button>
          {sentTo && <FormStatus>Invitation sent to {sentTo}.</FormStatus>}
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

const invitationStates = {
  pending: { label: "Pending", tag: "neutral", when: "Expires" },
  bounced: { label: "Bounced", tag: "accent-2", when: "Expires" },
  expired: { label: "Expired", tag: "neutral", when: "Expired" },
} as const;

type InvitationsSectionProps = Omit<MembersActions, "updateMember"> & { invitations: Invitation[] };

function InvitationsSection({
  invitations,
  createInvitation,
  resendInvitation,
  revokeInvitation,
}: InvitationsSectionProps) {
  const call = useActionCall();
  const [resentTo, setResentTo] = useState<string>();
  const [pendingRevoke, setPendingRevoke] = useState<Invitation>();
  const [revoking, setRevoking] = useState(false);

  async function resend(invitation: Invitation) {
    setResentTo(undefined);
    if (await call(() => resendInvitation({ id: invitation.id }))) setResentTo(invitation.email);
  }

  async function revoke(invitation: Invitation) {
    setRevoking(true);
    await call(() => revokeInvitation({ id: invitation.id }));
    setRevoking(false);
    setPendingRevoke(undefined);
  }

  return (
    <SettingsSection
      title="Invitations"
      count={invitations.length}
      status={resentTo && <FormStatus>Invitation resent to {resentTo}.</FormStatus>}
      action={
        <Link
          href="/settings/notifications"
          className="tl-btn tl-btn--sm tl-btn--secondary">
          Notification status
        </Link>
      }>
      <InviteForm createInvitation={createInvitation} />
      {invitations.length === 0 ? (
        <SettingsEmpty>No open invitations. Invite someone by email above.</SettingsEmpty>
      ) : (
        <Table aria-label="Invitations">
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Invited by</th>
              <th scope="col">State</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => {
              const state = invitationStates[invitation.state];
              return (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td>{invitation.invitedBy.fullName}</td>
                  <td>
                    <div className="tl-table__who">
                      <Tag variant={state.tag}>{state.label}</Tag>
                      <time
                        className="tl-table__note"
                        dateTime={invitation.expiresAt}>
                        {`${state.when} ${formatDate(invitation.expiresAt)}`}
                      </time>
                    </div>
                  </td>
                  <td className="tl-table__end">
                    {invitation.state !== "pending" && (
                      <Button
                        size="sm"
                        variant="quiet"
                        aria-label={`Resend invitation to ${invitation.email}`}
                        onClick={() => resend(invitation)}>
                        Resend
                      </Button>
                    )}
                    <Menu
                      label={`Actions for ${invitation.email}`}
                      icon={<ActionsIcon />}
                      onAction={(key) =>
                        key === "resend" ? resend(invitation) : setPendingRevoke(invitation)
                      }>
                      {invitation.state === "pending" && <MenuItem id="resend">Resend</MenuItem>}
                      <MenuItem
                        id="revoke"
                        danger>
                        Revoke…
                      </MenuItem>
                    </Menu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {pendingRevoke && (
        <Confirmation
          title="Revoke invitation?"
          body={`The link sent to ${pendingRevoke.email} will stop working.`}
          confirm="Revoke invitation"
          busy={revoking}
          onCancel={() => setPendingRevoke(undefined)}
          onConfirm={() => revoke(pendingRevoke)}
        />
      )}
    </SettingsSection>
  );
}

function ActionsIcon() {
  return <Ellipsis size={15} />;
}

type MembersSectionProps = Pick<MembersActions, "updateMember"> & { members: Me[]; you: string };

function MembersSection({ members, you, updateMember }: MembersSectionProps) {
  const call = useActionCall();
  const [deactivating, setDeactivating] = useState<Me>();
  const [updating, setUpdating] = useState(false);

  async function update(member: Me, change: Omit<MemberChange, "username">) {
    setUpdating(true);
    await call(() => updateMember({ username: member.username, ...change }));
    setUpdating(false);
  }

  function act(member: Me, action: string) {
    if (action === "deactivate") setDeactivating(member);
    if (action === "reactivate") update(member, { deactivated: false });
    if (action === "make-admin") update(member, { role: "admin" });
    if (action === "remove-admin") update(member, { role: "member" });
  }

  return (
    <SettingsSection
      title="Members"
      count={members.length}>
      <Table
        aria-label="Members"
        columns={{ name: "auto", username: "110px", email: "auto", role: "90px", actions: "100px" }}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Username</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr
              key={member.username}
              className={member.deactivated ? "tl-table__muted" : undefined}>
              <td>
                <div className="tl-table__who">
                  <Avatar
                    initials={member.initials}
                    tone={member.username === you ? "accent" : "neutral"}
                  />
                  <span>
                    {member.fullName}
                    {member.deactivated && " (deactivated)"}
                    {member.username === you && <span className="tl-table__muted"> (you)</span>}
                  </span>
                </div>
              </td>
              <td className="tl-table__mono">{member.username}</td>
              <td>{member.email}</td>
              <td>
                <Tag variant={member.role === "admin" ? "accent" : "neutral"}>
                  {member.role === "admin" ? "Admin" : "Member"}
                </Tag>
              </td>
              <td className="tl-table__end">
                <Menu
                  label={`Actions for ${member.fullName}`}
                  icon={<ActionsIcon />}
                  onAction={(key) => act(member, String(key))}>
                  {member.deactivated ? (
                    <MenuItem id="reactivate">Reactivate</MenuItem>
                  ) : (
                    <>
                      {member.role === "admin" ? (
                        <MenuItem id="remove-admin">Remove admin</MenuItem>
                      ) : (
                        <MenuItem id="make-admin">Make admin</MenuItem>
                      )}
                      <MenuSep />
                      <MenuItem
                        id="deactivate"
                        danger>
                        Deactivate
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {deactivating && (
        <Confirmation
          title={`Deactivate ${deactivating.fullName}?`}
          body={`${deactivating.fullName} will be signed out and can't sign in until reactivated.`}
          confirm="Deactivate"
          busy={updating}
          onCancel={() => setDeactivating(undefined)}
          onConfirm={async () => {
            await update(deactivating, { deactivated: true });
            setDeactivating(undefined);
          }}
        />
      )}
    </SettingsSection>
  );
}

type ConfirmationProps = {
  title: string;
  body: string;
  confirm: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function Confirmation({ title, body, confirm, busy, onCancel, onConfirm }: ConfirmationProps) {
  return (
    <Dialog
      open
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={onConfirm}>
            {confirm}
          </Button>
        </>
      }>
      {body}
    </Dialog>
  );
}