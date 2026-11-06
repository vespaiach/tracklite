import type { ClientErrorEvent, describeUserAgent } from "../../domain/identity/client-error";
import type { Result } from "../../domain/shared/result";

export type Passwords = {
  hash(password: string): Promise<string>;
  verify(passwordHash: string | undefined, password: string): Promise<boolean>;
  needsRehash(passwordHash: string): boolean;
};

export type SignInLimits = {
  reached(normalizedEmail: string, ip: string): Promise<boolean>;
  recordFailure(normalizedEmail: string, ip: string): Promise<void>;
};

export type RequestLimits<Requester> = {
  reached(requester: Requester): Promise<boolean>;
  record(requester: Requester): Promise<void>;
};

export type ResetRequester = { email: string; ip: string };

export type ClientErrorReporter = { username: string | null; ip: string };

type Sent = Result<{ providerMessageId: string }, "email-failed">;

export type AccountEmails = {
  invitation(to: string, inviterName: string, token: string): Promise<Sent>;
  passwordReset(to: string, token: string): Promise<Sent>;
};

export type ClientErrorLog = {
  write(
    event: ClientErrorEvent,
    error: { name: string; message: string; stack?: string },
    details: ClientErrorDetails,
  ): void;
};

type ClientErrorDetails = ReturnType<typeof describeUserAgent> & {
  actor?: string;
  ip: string;
  page: string;
  build?: string;
  component?: string;
  digest?: string;
  timeZone?: string;
  occurredAt: string;
};

export type SetupSecret = {
  configured(): boolean;
  matches(secret: string): boolean;
};