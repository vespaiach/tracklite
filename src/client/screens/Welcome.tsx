import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { Navigate, useNavigate } from "react-router";
import {
  Button,
  Field,
  Input,
  Mono,
  SignedOutFields,
  SignedOutForm,
  SignedOutFormError,
  SignedOutHeading,
  SignedOutLayout,
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  useCheckSetupSecretMutation,
  useCreateFirstAdminMutation,
  useSetupStatusQuery,
} from "../api";
import { showToast } from "../toast";

type ProfileField = "email" | "fullName" | "username" | "password" | "confirmPassword";

const passwordsDiffer = "Passwords don’t match";

export function Welcome() {
  const setup = useSetupStatusQuery();
  const [secret, setSecret] = useState<string>();

  if (setup.data?.needed === false) {
    return (
      <Navigate
        to="/sign-in"
        replace
      />
    );
  }

  return (
    <SignedOutLayout>
      {!setup.isLoading &&
        (secret === undefined ? <SecretStep onAccepted={setSecret} /> : <ProfileStep secret={secret} />)}
    </SignedOutLayout>
  );
}

function SecretStep({ onAccepted }: { onAccepted: (secret: string) => void }) {
  const [checkSetupSecret, { isLoading: checking }] = useCheckSetupSecretMutation();
  const dispatch = useDispatch();
  const [secret, setSecret] = useState("");
  const [formError, setFormError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    try {
      await checkSetupSecret({ secret }).unwrap();
      onAccepted(secret);
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === "network") {
        dispatch(showToast(failure.message));
      } else {
        setFormError(failure.fields?.secret ?? failure.message);
      }
    }
  }

  return (
    <SignedOutForm onSubmit={submit}>
      <SignedOutHeading title="Welcome to Tracklite">
        Enter the setup secret from the server's config to create the first admin.
      </SignedOutHeading>
      <SignedOutFields>
        <Field label="Setup secret">
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          )}
        </Field>
      </SignedOutFields>
      {formError && <SignedOutFormError>{formError}</SignedOutFormError>}
      <Button
        variant="primary"
        type="submit"
        block
        disabled={checking}
        aria-busy={checking || undefined}>
        {checking ? "Checking…" : "Continue"}
      </Button>
    </SignedOutForm>
  );
}

function ProfileStep({ secret }: { secret: string }) {
  const [createFirstAdmin, { isLoading: saving }] = useCreateFirstAdminMutation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [profile, setProfile] = useState<Record<ProfileField, string>>({
    email: "",
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [formError, setFormError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const { confirmPassword, ...firstAdmin } = profile;
    if (confirmPassword !== firstAdmin.password) {
      setFieldErrors({ confirmPassword: passwordsDiffer });
      return;
    }

    try {
      await createFirstAdmin({ secret, ...firstAdmin }).unwrap();
      await navigate("/my-issues", { replace: true });
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.fields) {
        setFieldErrors(failure.fields);
      } else if (failure.status === "network") {
        dispatch(showToast(failure.message));
      } else {
        setFormError(failure.message);
      }
    }
  }

  function edit(field: ProfileField) {
    return (event: { target: { value: string } }) => setProfile({ ...profile, [field]: event.target.value });
  }

  return (
    <SignedOutForm onSubmit={submit}>
      <SignedOutHeading title="Create the first admin">
        Your username and email can't be changed later.
      </SignedOutHeading>
      <SignedOutFields>
        <Field
          label="Email"
          error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              autoComplete="email"
              value={profile.email}
              onChange={edit("email")}
            />
          )}
        </Field>
        <Field
          label="Full name"
          error={fieldErrors.fullName}>
          {(props) => (
            <Input
              {...props}
              autoComplete="name"
              value={profile.fullName}
              onChange={edit("fullName")}
            />
          )}
        </Field>
        <Field
          label="Username"
          help={
            <>
              <Mono>2</Mono> to <Mono>20</Mono> lowercase letters, digits or hyphens. Used for @mentions.
            </>
          }
          error={fieldErrors.username}>
          {(props) => (
            <Input
              {...props}
              autoComplete="username"
              value={profile.username}
              onChange={edit("username")}
            />
          )}
        </Field>
        <Field
          label="Password"
          help={
            <>
              <Mono>12</Mono> to <Mono>128</Mono> characters. Spaces count.
            </>
          }
          error={fieldErrors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={profile.password}
              onChange={edit("password")}
            />
          )}
        </Field>
        <Field
          label="Confirm password"
          error={fieldErrors.confirmPassword}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={profile.confirmPassword}
              onChange={edit("confirmPassword")}
            />
          )}
        </Field>
      </SignedOutFields>
      {formError && <SignedOutFormError>{formError}</SignedOutFormError>}
      <Button
        variant="primary"
        type="submit"
        block
        disabled={saving}
        aria-busy={saving || undefined}>
        {saving ? "Creating…" : "Create admin"}
      </Button>
    </SignedOutForm>
  );
}