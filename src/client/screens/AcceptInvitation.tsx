import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import {
  Button,
  Fact,
  FactList,
  Field,
  Input,
  SignedOutAlert,
  SignedOutFields,
  SignedOutForm,
  SignedOutHeading,
  SignedOutLayout,
  SignedOutMessage,
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
import { useTokenFromAddress } from "../useTokenFromAddress";

type ProfileField = "fullName" | "username" | "password";

function asTitleAndText(message: string) {
  const [title, ...rest] = message.split(/(?<=\.) /);
  return { title, text: rest.join(" ") };
}

export function AcceptInvitation() {
  const token = useTokenFromAddress();
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
        <SignedOutMessage
          text={`You're signed in as ${me.data.fullName}. Sign out to accept this invitation.`}>
          <Button
            disabled={signingOut}
            onClick={() => signOut()}>
            Sign out
          </Button>
        </SignedOutMessage>
      </SignedOutLayout>
    );
  }

  const lookupFailure = lookup.error as ApiFailure | undefined;
  const ended = endedOnSubmit ?? (lookupFailure?.status === 410 ? lookupFailure.message : undefined);

  if (ended) {
    return (
      <SignedOutLayout>
        <SignedOutMessage {...asTitleAndText(ended)} />
      </SignedOutLayout>
    );
  }

  if (lookupFailure) {
    return (
      <SignedOutLayout>
        <SignedOutAlert text="Couldn’t load this.">
          <Button
            size="sm"
            onClick={() => lookup.refetch()}>
            Retry
          </Button>
        </SignedOutAlert>
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