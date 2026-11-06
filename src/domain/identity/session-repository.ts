export type SessionRepository = {
  start(memberId: string): Promise<string>;
  end(token: string): Promise<void>;
  endAllOf(memberId: string): Promise<void>;
  endOthersOf(memberId: string, keptToken: string): Promise<void>;
};