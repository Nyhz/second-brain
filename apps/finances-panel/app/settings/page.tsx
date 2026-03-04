'use client';

import { Card, ThemeSelector } from '../../components/ui';
import { useThemeMode } from '../../components/theme-provider';

export default function SettingsPage() {
  const { mode, setMode } = useThemeMode();

  return (
    <div className="grid" style={{ gap: '1rem' }}>
      <h1>Settings</h1>
      <Card title="Theme & Preferences">
        <p className="small">Choose a serious SaaS presentation mode.</p>
        <ThemeSelector value={mode} onChange={setMode} />
      </Card>
      <Card title="Data Mode">
        <p className="small">
          The dashboard renders live API data only and shows explicit empty
          states when there is no data.
        </p>
      </Card>
    </div>
  );
}
