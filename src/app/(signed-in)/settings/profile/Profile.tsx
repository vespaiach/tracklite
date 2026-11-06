"use client";

import { useState } from "react";
import {
  AppBar,
  AppBarTitle,
  Button,
  Fact,
  FactList,
  Field,
  FormError,
  FormStatus,
  Input,
  Mono,
  SettingsActions,
  SettingsForm,
  SettingsInline,
  SettingsLayout,
  SettingsSection,
} from "../../../../components/ui/track-lite";
import { useFormAction } from "../../../../components/useFormAction";
import type { FormAction, Me } from "../../../../contract";

const roleNames: Record<Me["role"], string> = { admin: "Admin", member: "Member" };

type ProfileProps = { me: Me; updateProfile: FormAction; changePassword: FormAction };

export function Profile({ me, updateProfile, changePassword }: ProfileProps) {
  return (
    <>
      <AppBar>
        <AppBarTitle>Profile</AppBarTitle>
      </AppBar>
      <SettingsLayout compact>
        <SettingsSection title="Account">
          <FullNameForm
            savedName={me.fullName}
            updateProfile={updateProfile}
          />
          <FactList note="Username and email can't be changed.">
            <Fact
              label="Username"
              mono>
              {me.username}
            </Fact>
            <Fact label="Email">{me.email}</Fact>
            <Fact label="Role">{roleNames[me.role]}</Fact>
          </FactList>
        </SettingsSection>
        <ChangePasswordForm changePassword={changePassword} />
      </SettingsLayout>
    </>
  );
}

function FullNameForm({ savedName, updateProfile }: { savedName: string; updateProfile: FormAction }) {
  const [fullName, setFullName] = useState(savedName);
  const [saved, setSaved] = useState(false);
  const { error, submit, pending } = useFormAction(updateProfile, () => setSaved(true), []);

  return (
    <SettingsForm onSubmit={submit}>
      <SettingsInline>
        <Field
          label="Full name"
          error={error?.fields?.fullName}>
          {(props) => (
            <Input
              {...props}
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setSaved(false);
              }}
            />
          )}
        </Field>
        <SettingsActions>
          <Button
            variant="primary"
            type="submit"
            disabled={pending || fullName.trim() === savedName}
            aria-busy={pending || undefined}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved && <FormStatus>Name saved.</FormStatus>}
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function ChangePasswordForm({ changePassword }: { changePassword: FormAction }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changed, setChanged] = useState(false);
  const { error, submit, pending } = useFormAction(changePassword, () => {
    setCurrentPassword("");
    setNewPassword("");
    setChanged(true);
  });

  return (
    <SettingsForm
      title="Change password"
      onSubmit={(event) => {
        setChanged(false);
        submit(event);
      }}>
      <Field
        label="Current password"
        error={error?.fields?.currentPassword}>
        {(props) => (
          <Input
            {...props}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="New password"
        help={
          <>
            <Mono>12</Mono> to <Mono>128</Mono> characters. Spaces count.
          </>
        }
        error={error?.fields?.newPassword}>
        {(props) => (
          <Input
            {...props}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        )}
      </Field>
      {error && !error.fields && <FormError>{error.message}</FormError>}
      <SettingsActions>
        <Button
          variant="primary"
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}>
          {pending ? "Changing…" : "Change password"}
        </Button>
        {changed && <FormStatus>Password changed. You've been signed out everywhere else.</FormStatus>}
      </SettingsActions>
    </SettingsForm>
  );
}