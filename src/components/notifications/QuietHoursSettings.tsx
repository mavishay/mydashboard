import { useState, useEffect, useCallback } from 'react';

interface QuietHoursSettings {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export function QuietHoursSettings() {
  const [settings, setSettings] = useState<QuietHoursSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const data = await window.electronAPI.notification.getQuietHours();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load quiet hours settings:', err);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await window.electronAPI.notification.setQuietHours(settings);
    } catch (err) {
      console.error('Failed to save quiet hours settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading...</p>;
  }

  const timeOptions = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.75rem' }}>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          style={{ width: '1.25rem', height: '1.25rem' }}
        />
        <span style={{ fontSize: '0.875rem' }}>
          {settings.enabled ? 'Quiet hours enabled' : 'Quiet hours disabled'}
        </span>
      </label>

      {settings.enabled && (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#666' }}>From:</span>
          <select
            value={settings.startHour}
            onChange={(e) => setSettings({ ...settings, startHour: Number(e.target.value) })}
            style={{ padding: '0.375rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            {timeOptions.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <select
            value={settings.startMinute}
            onChange={(e) => setSettings({ ...settings, startMinute: Number(e.target.value) })}
            style={{ padding: '0.375rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
            ))}
          </select>

          <span style={{ fontSize: '0.875rem', color: '#666' }}>To:</span>
          <select
            value={settings.endHour}
            onChange={(e) => setSettings({ ...settings, endHour: Number(e.target.value) })}
            style={{ padding: '0.375rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            {timeOptions.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <select
            value={settings.endMinute}
            onChange={(e) => setSettings({ ...settings, endMinute: Number(e.target.value) })}
            style={{ padding: '0.375rem', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: '4px',
          border: 'none',
          background: saving ? '#ccc' : '#1976d2',
          color: '#fff',
          cursor: saving ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
        }}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
