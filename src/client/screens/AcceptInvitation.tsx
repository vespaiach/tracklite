import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useSearchParams } from "react-router";
import {
  Button,
  Fact,
  FactList,
  Field,
  Input,
  SignedOutFields,
  SignedOutForm,
  SignedOutHeading,
  SignedOutLayout,
  SignedOutNote,
  SignedOutStatus,
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  useAcceptInvitationMutation,
  useLookUpInvitationQuery,
  useMeQuery,
  useSignOutMutation,
} from "../api";
import { showToast } from "../toast";
import { useShowLoading } from "../useShowLoading";

type ProfileField = "fullName" | "username" | "password";

export function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const me = useMeQuery();
  const lookup = useLookUpInvitationQuery({ token }, { skip: !me.isError });
  const [signOut, { isLoading: signingOut }] = useSignOutMutation();
  const [acceptInvitation, { isLoading: saving }] = useAcceptInvitationMutation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [profile, setProfile] = useState<Record<ProfileField, string>>({
    fullName: "",
    username: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [endedOnSubmit, setEndedOnSubmit] = useState<string>();
  const showLoading = useShowLoading(!me.isSuccess && !lookup.isSuccess && !lookup.isError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await acceptInvitation({ token, ...profile }).unwrap();
      await navigate("/my-issues", { replace: true });
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === 410) {
        setEndedOnSubmit(failure.message);
      } else if (failure.fields) {
        setFieldErrors(failure.fields);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  function edit(field: ProfileField) {
    return (event: { target: { value: string } }) => setProfile({ ...profile, [field]: event.target.value });
  }

  if (me.isSuccess) {
    return (
      <SignedOutLayout>
        <SignedOutNote>
          You're signed in as {me.data.fullName}. Sign out to accept this invitation.
        </SignedOutNote>
        <Button
          variant="primary"
          block
          disabled={signingOut}
          onClick={() => signOut()}>
          Sign out
        </Button>
      </SignedOutLayout>
    );
  }

  const lookupFailure = lookup.error as ApiFailure | undefined;
  const ended = endedOnSubmit ?? (lookupFailure?.status === 410 ? lookupFailure.message : undefined);

  if (ended) {
    return (
      <SignedOutLayout>
        <SignedOutNote>{ended}</SignedOutNote>
      </SignedOutLayout>
    );
  }

  if (lookupFailure) {
    return (
      <SignedOutLayout>
        <SignedOutNote>Couldn't load this.</SignedOutNote>
        <Button onClick={() => lookup.refetch()}>Retry</Button>
      </SignedOutLayout>
    );
  }

  if (!lookup.isSuccess) {
    return (
      <SignedOutLayout>
        {showLoading && <SignedOutStatus>Checking your invitation…</SignedOutStatus>}
      </SignedOutLayout>
    );
  }

  const { email } = lookup.data;

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Join Tracklite">
          You're invited as {email}. Your username and email can't be changed later.
        </SignedOutHeading>
        <SignedOutFields>
          <FactList>
            <Fact label="Email">{email}</Fact>
          </FactList>
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
            help="2 to 20 lowercase letters, digits or hyphens. Used for @mentions."
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
            help="12 to 128 characters. Spaces count."
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
        </SignedOutFields>
        <Button
          variant="primary"
          type="submit"
          block
          disabled={saving}
          aria-busy={saving || undefined}>
          {saving ? "Joining…" : "Join Tracklite"}
        </Button>
      </SignedOutForm>
    </SignedOutLayout>
  );
}