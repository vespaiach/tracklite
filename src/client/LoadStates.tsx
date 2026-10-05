import { Button, FormStatus, SettingsActions, SettingsLayout } from "../components/ui/track-lite";

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <SettingsLayout>
      <SettingsActions>
        <FormStatus>Couldn't load this.</FormStatus>
        <Button
          size="sm"
          onClick={onRetry}>
          Retry
        </Button>
      </SettingsActions>
    </SettingsLayout>
  );
}

export function Loading({ show }: { show: boolean }) {
  return <SettingsLayout>{show && <FormStatus>Loading…</FormStatus>}</SettingsLayout>;
}