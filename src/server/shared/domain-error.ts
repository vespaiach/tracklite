export type DomainErrorKind =
  | "signedOut"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "expired"
  | "invalid"
  | "limited"
  | "unavailable";

export class DomainError extends Error {
  readonly kind: DomainErrorKind;
  readonly fields?: Record<string, string>;

  constructor(kind: DomainErrorKind, message: string, fields?: Record<string, string>) {
    super(message);
    this.kind = kind;
    this.fields = fields;
  }
}