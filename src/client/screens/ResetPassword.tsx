import { type FormEvent, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useSearchParams } from "react-router";
import {
  Button,
  Field,
  Input,
  SignedOutForm,
  SignedOutHeading,
  SignedOutLayout,
  SignedOutNote,
  SignedOutStatus,
} from "../../components/ui/track-lite";
import {
  type ApiFailure,
  useLookUpResetLinkQuery,
  useMeQuery,
  useResetPasswordMutation,
  useSignOutMutation,
} from "../api";
import { showToast } from "../toast";
import { useShowLoading } from "../useShowLoading";

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const me = useMeQuery();
  const lookup = useLookUpResetLinkQuery({ token }, { skip: !me.isError });
  const [signOut, { isLoading: signingOut }] = useSignOutMutation();
  const [resetPassword, { isLoading: saving }] = useResetPasswordMutation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string>();
  const [expiredOnSubmit, setExpiredOnSubmit] = useState(false);
  const showLoading = useShowLoading(!me.isSuccess && !lookup.isSuccess && !lookup.isError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await resetPassword({ token, password }).unwrap();
      await navigate("/my-issues", { replace: true });
    } catch (error) {
      const failure = error as ApiFailure;
      if (failure.status === 410) {
        setExpiredOnSubmit(true);
      } else if (failure.fields?.password) {
        setPasswordError(failure.fields.password);
      } else {
        dispatch(showToast(failure.message));
      }
    }
  }

  if (me.isSuccess) {
    return (
      <SignedOutLayout>
        <SignedOutNote>You're signed in as {me.data.fullName}. Sign out to reset a password.</SignedOutNote>
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

  if (expiredOnSubmit || lookupFailure?.status === 410) {
    return (
      <SignedOutLayout>
        <SignedOutHeading title="This link has expired">
          Reset links work once and expire after 30 minutes.
        </SignedOutHeading>
        <Button
          variant="primary"
          block
          onClick={() => navigate("/forgot-password")}>
          Request a new link
        </Button>
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
        {showLoading && <SignedOutStatus>Checking your link…</SignedOutStatus>}
      </SignedOutLayout>
    );
  }

  return (
    <SignedOutLayout>
      <SignedOutForm onSubmit={submit}>
        <SignedOutHeading title="Set a new password" />
        <Field
          label="New password"
          help="12 to 128 characters. Spaces count."
          error={passwordError}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button
          variant="primary"
          type="submit"
          block
          disabled={saving}
          aria-busy={saving || undefined}>
          Set password
        </Button>
      </SignedOutForm>
    </SignedOutLayout>
  );
}