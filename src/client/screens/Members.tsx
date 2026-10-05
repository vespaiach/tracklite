import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { type FormEvent, useState } from "react";
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
import { useShowLoading } from "../useShowLoading";

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
  const members = useMembersQuery();
  const invitations = useInvitationsQuery();
  const showLoading = useShowLoading(members.isLoading || invitations.isLoading);

  if (members.isError || invitations.isError) {
    return (
      <SettingsLayout>
        <SettingsActions>
          <FormStatus>Couldn't load this.</FormStatus>
          <Button
            size="sm"
            onClick={() => {
              if (members.isError) members.refetch();
              if (invitations.isError) invitations.refetch();
            }}>
            Retry
          </Button>
        </SettingsActions>
      </SettingsLayout>
    );
  }

  if (!members.data || !invitations.data) {
    return <SettingsLayout>{showLoading && <FormStatus>Loading…</FormStatus>}</SettingsLayout>;
  }

  return (
    <SettingsLayout wide>
      <InviteForm />
      <InvitationsSection invitations={invitations.data} />
      <MembersSection members={members.data} />
    </SettingsLayout>
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
    <SettingsSection title="Invite">
      <SettingsForm
        aria-label="Invite"
        onSubmit={submit}>
        <SettingsInline>
          <Field
            label="Email"
            help="The link works once and expires after 7 days."
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
    </SettingsSection>
  );
}

const invitationStates = {
  pending: { label: "Pending", tag: "outline", when: "Expires" },
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
      status={resentTo && <FormStatus>Invitation resent to {resentTo}.</FormStatus>}>
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
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={`Resend invitation to ${invitation.email}`}
                      onClick={() => resend(invitation)}>
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="quiet"
                      aria-label={`Revoke invitation to ${invitation.email}`}
                      onClick={() => setPendingRevoke(invitation)}>
                      Revoke
                    </Button>
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

function MembersSection({ members }: { members: Me[] }) {
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
    <SettingsSection title="Members">
      <Table aria-label="Members">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Username</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.username}>
              <td>
                <div className="tl-table__who">
                  <Avatar
                    initials={member.initials}
                    tone={member.deactivated ? "neutral" : "accent"}
                  />
                  <span>
                    {member.fullName}
                    {member.deactivated && <span className="tl-table__muted"> (deactivated)</span>}
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
              <td>
                {member.deactivated ? (
                  <Tag variant="neutral">Deactivated</Tag>
                ) : (
                  <span className="tl-table__muted">Active</span>
                )}
              </td>
              <td className="tl-table__end">
                <Menu
                  label={`Actions for ${member.fullName}`}
                  icon={
                    <DotsThree
                      size={15}
                      weight="duotone"
                    />
                  }
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