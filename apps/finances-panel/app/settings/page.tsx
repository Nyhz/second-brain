import { Card } from '@second-brain/ui';

export default function SettingsPage() {
  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <h1>Settings</h1>
      <Card title="Theme & Preferences">
        <p className="small">
          Dark-finance theme is active for this milestone.
        </p>
      </Card>
      <Card title="Data Mode">
        <p className="small">
          You are currently using deterministic seeded market mocks for
          dashboard previews.
        </p>
      </Card>
    </div>
  );
}
