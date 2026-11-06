import * as v from "valibot";
import { DomainError } from "./domain-error";

type Parses<T> = { schema: v.GenericSchema<unknown, T> };

export function from<T>({ schema }: Parses<T>, raw: unknown) {
  const result = v.safeParse(schema, raw);
  if (!result.success) throw new DomainError("invalid", result.issues[0].message);
  return result.output;
}

export function tryFrom<T>({ schema }: Parses<T>, raw: unknown) {
  const result = v.safeParse(schema, raw);
  return result.success ? result.output : undefined;
}

const projectKeyRule = "Key must be 2 to 5 letters";

export class ProjectKey {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string(projectKeyRule),
    v.regex(/^[A-Za-z]{2,5}$/, projectKeyRule),
    v.toUpperCase(),
    v.transform((value) => new ProjectKey(value)),
  );

  static from(raw: unknown) {
    return from(ProjectKey, raw);
  }
}

const issueIdRule = "Not an issue ID";

export class IssueId {
  readonly value: string;
  readonly key: ProjectKey;
  readonly number: number;

  private constructor(value: string) {
    const [key, number] = value.split("-");
    this.value = value;
    this.key = ProjectKey.from(key);
    this.number = Number(number);
  }

  static readonly schema = v.pipe(
    v.string(issueIdRule),
    v.regex(/^[A-Za-z]{2,5}-[1-9]\d{0,8}$/, issueIdRule),
    v.toUpperCase(),
    v.transform((value) => new IssueId(value)),
  );

  static from(raw: unknown) {
    return from(IssueId, raw);
  }
}

export const usernameRule = "Use 2 to 20 letters, digits or hyphens";

export class Username {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string(usernameRule),
    v.toLowerCase(),
    v.regex(/^[a-z0-9-]{2,20}$/, usernameRule),
    v.transform((value) => new Username(value)),
  );

  static from(raw: unknown) {
    return from(Username, raw);
  }
}

const requestIdRule = "Invalid request";

export class RequestId {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string(requestIdRule),
    v.uuid(requestIdRule),
    v.transform((value) => new RequestId(value)),
  );

  static from(raw: unknown) {
    return from(RequestId, raw);
  }
}

const uuidRule = "Not an ID";

export class Uuid {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string(uuidRule),
    v.uuid(uuidRule),
    v.transform((value) => new Uuid(value)),
  );

  static from(raw: unknown) {
    return from(Uuid, raw);
  }
}