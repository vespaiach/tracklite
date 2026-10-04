import "server-only";

export type Email = { to: string; subject: string; text: string };

export const outbox = { sent: [] as Email[], failing: false };