import { Ellipsis } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AppBar,
  AppBarTitle,
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
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  type Invitation,
  type Me,
  useCreateInvitationMutation,
  useInvitationsQuery,
  useMeQuery,
  useMembersQuery,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useUpdateMemberMutation,
} from "../api";
import { formatDate } from "../dates";
import { useFailureToast } from "../failure";
import { Zone, zoneState } from "../Zone";

export function Members() {
  const { data: me } = useMeQuery();
  return (
    <>
      <AppBar>
        <AppBarTitle>Members</AppBarTitle>
      </AppBar>
      {me?.role === "admin" ? (
        <MembersAdmin />
      ) : (
        <SettingsLayout>
          <FormStatus>You don't have permission to do that.</FormStatus>
        </SettingsLayout>
      )}
    </>
  );
}

function MembersAdmin() {
  const { data: me } = useMeQuery();
  const members = useMembersQuery();
  const invitations = useInvitationsQuery();
  const loaded = useMemo(
    () =>
      me && members.data && invitations.data
        ? { you: me.username, members: members.data, invitations: invitations.data }
        : undefined,
    [me, members.data, invitations.data],
  );

  return (
    <Zone
      what="members"
      state={zoneState({ data: loaded, isError: members.isError || invitations.isError })}
      retry={() => {
        members.refetch();
        invitations.refetch();
      }}
      page>
      {(data) => (
        <SettingsLayout wide>
          <MembersSection
            members={data.members}
            you={data.you}
          />
          <InvitationsSection invitations={data.invitations} />
        </SettingsLayout>
      )}
    </Zone>
  );
}

function InviteForm() {
  const [createInvitation, { isLoading: sending }] = useCreateInvitationMutation();
  const toastFailure = useFailureToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSentTo(undefined);
    try {
      const invitation = await createInvitation({ email }).unwrap();
      setEmail("");
      setSentTo(invitation.email);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.status === 422) {
        setError(failure.fields?.email ?? failure.message);
      } else {
        toastFailure(failure);
      }
    }
  }

  return (
    <SettingsForm
      aria-label="Invite by email"
      onSubmit={submit}>
      <SettingsInline>
        <Field
          label="Email"
          help={
            <>
              The link works once and expires after <Mono>7</Mono> days.
            </>
          }
          error={error}>
          {(props) => (
            <Input
              {...props}
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
            disabled={sending}
            aria-busy={sending || undefined}>
            {sending ? "Sending…" : "Send invitation"}
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

function InvitationsSection({ invitations }: { invitations: Invitation[] }) {
  const [resendInvitation] = useResendInvitationMutation();
  const [revokeInvitation, { isLoading: revoking }] = useRevokeInvitationMutation();
  const toastFailure = useFailureToast();
  const [resentTo, setResentTo] = useState<string>();
  const [pendingRevoke, setPendingRevoke] = useState<Invitation>();

  async function resend(invitation: Invitation) {
    setResentTo(undefined);
    try {
      await resendInvitation(invitation.id).unwrap();
      setResentTo(invitation.email);
    } catch (caught) {
      toastFailure(caught);
    }
  }

  async function revoke(invitation: Invitation) {
    try {
      await revokeInvitation(invitation.id).unwrap();
    } catch (caught) {
      toastFailure(caught);
    }
    setPendingRevoke(undefined);
  }

  return (
    <SettingsSection
      title="Invitations"
      count={invitations.length}
      status={resentTo && <FormStatus>Invitation resent to {resentTo}.</FormStatus>}
      action={
        <Link
          to="/settings/notifications"
          className="tl-btn tl-btn--sm tl-btn--secondary">
          Notification status
        </Link>
      }>
      <InviteForm />
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

function MembersSection({ members, you }: { members: Me[]; you: string }) {
  const [updateMember, { isLoading: updating }] = useUpdateMemberMutation();
  const toastFailure = useFailureToast();
  const [deactivating, setDeactivating] = useState<Me>();

  async function update(member: Me, change: { role?: Me["role"]; deactivated?: boolean }) {
    try {
      await updateMember({ username: member.username, ...change }).unwrap();
    } catch (caught) {
      toastFailure(caught);
    }
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