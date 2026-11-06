"use client";

import { type FormEvent, startTransition, useActionState } from "react";
import type { ActionError, ActionResult } from "../contract";
import { useToast } from "./toast";

const couldNotSave = "Couldn’t save. Try again.";
const shownBesideForm: ActionError["kind"][] = ["invalid", "limited", "expired"];

export function useFormAction<Data>(
  act: (form: FormData) => Promise<ActionResult<Data>>,
  onDone: (data: Data) => void,
  besideForm = shownBesideForm,
) {
  const toast = useToast();

  const [error, dispatch, pending] = useActionState(async (_shown: ActionError | null, form: FormData) => {
    let result: ActionResult<Data>;
    try {
      result = await act(form);
    } catch {
      toast(couldNotSave);
      return null;
    }

    if (result.ok) {
      onDone(result.data);
      return null;
    }
    if (result.error.fields || besideForm.includes(result.error.kind)) return result.error;
    toast(result.error.message);
    return null;
  }, null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  }

  return { error, submit, pending };
}