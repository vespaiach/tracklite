import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
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
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  type Me,
  useChangePasswordMutation,
  useMeQuery,
  useUpdateProfileMutation,
} from "../api";
import { showToast } from "../toast";
import { Zone, zoneState } from "../Zone";

const roleNames: Record<Me["role"], string> = { admin: "Admin", member: "Member" };

export function Profile() {
  const me = useMeQuery();
  return (
    <>
      <AppBar>
        <AppBarTitle>Profile</AppBarTitle>
      </AppBar>
      <Zone
        what="your profile"
        state={zoneState(me)}
        retry={me.refetch}
        page>
        {(loaded) => <ProfileForms me={loaded} />}
      </Zone>
    </>
  );
}

function ProfileForms({ me }: { me: Me }) {
  return (
    <SettingsLayout compact>
      <SettingsSection title="Account">
        <FullNameForm savedName={me.fullName} />
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
      <ChangePasswordForm />
    </SettingsLayout>
  );
}

function FullNameForm({ savedName }: { savedName: string }) {
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation();
  const dispatch = useDispatch();
  const [fullName, setFullName] = useState(savedName);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    try {
      await updateProfile({ fullName }).unwrap();
      setSaved(true);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.fields?.fullName) {
        setError(failure.fields.fullName);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  return (
    <SettingsForm onSubmit={submit}>
      <SettingsInline>
        <Field
          label="Full name"
          error={error}>
          {(props) => (
            <Input
              {...props}
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
            disabled={saving || fullName.trim() === savedName}
            aria-busy={saving || undefined}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && <FormStatus>Name saved.</FormStatus>}
        </SettingsActions>
      </SettingsInline>
    </SettingsForm>
  );
}

function ChangePasswordForm() {
  const [changePassword, { isLoading: changing }] = useChangePasswordMutation();
  const dispatch = useDispatch();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [changed, setChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);
    setChanged(false);
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      setCurrentPassword("");
      setNewPassword("");
      setChanged(true);
    } catch (caught) {
      const failure = caught as ApiFailure;
      if (failure.fields) {
        setFieldErrors(failure.fields);
      } else if (failure.status === 429) {
        setFormError(failure.message);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  return (
    <SettingsForm
      title="Change password"
      onSubmit={submit}>
      <Field
        label="Current password"
        error={fieldErrors.currentPassword}>
        {(props) => (
          <Input
            {...props}
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
        error={fieldErrors.newPassword}>
        {(props) => (
          <Input
            {...props}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        )}
      </Field>
      {formError && <FormError>{formError}</FormError>}
      <SettingsActions>
        <Button
          variant="primary"
          type="submit"
          disabled={changing}
          aria-busy={changing || undefined}>
          {changing ? "Changing…" : "Change password"}
        </Button>
        {changed && <FormStatus>Password changed. You've been signed out everywhere else.</FormStatus>}
      </SettingsActions>
    </SettingsForm>
  );
}