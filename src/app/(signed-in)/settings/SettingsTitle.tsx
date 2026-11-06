"use client";

import { AppBar, AppBarTitle, FormStatus, SettingsLayout } from "../../../components/ui/track-lite";

export function SettingsTitle({ title }: { title: string }) {
  return (
    <AppBar>
      <AppBarTitle>{title}</AppBarTitle>
    </AppBar>
  );
}

export function NoPermission() {
  return (
    <SettingsLayout>
      <FormStatus>You don't have permission to do that.</FormStatus>
    </SettingsLayout>
  );
}