export type Passwords = {
  hash(password: string): Promise<string>;
  verify(passwordHash: string | undefined, password: string): Promise<boolean>;
  needsRehash(passwordHash: string): boolean;
};

export type SignInLimits = {
  reached(normalizedEmail: string, ip: string): Promise<boolean>;
  recordFailure(normalizedEmail: string, ip: string): Promise<void>;
};

export type SetupSecret = {
  configured(): boolean;
  matches(secret: string): boolean;
};