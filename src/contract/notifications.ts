export const notificationChannels = ["email"] as const;

export type NotificationChannel = (typeof notificationChannels)[number];

export type ChannelStats = {
  channel: NotificationChannel;
  sent: number;
  dropped: number;
  failed: number;
  bounced: number;
};

export type ProblemDelivery = {
  id: string;
  username: string;
  channel: NotificationChannel;
  target: string;
  state: "failed" | "bounced";
  attempts: number;
  at: string;
};

export type NotificationStats = {
  workerLastPassAt: string | null;
  workerStaleMinutes: number | null;
  queue: { pending: number; due: number; oldestDueSeconds: number };
  channels: ChannelStats[];
  recentProblems: ProblemDelivery[];
};