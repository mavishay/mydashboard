import { useState, useEffect } from 'react';

interface NotificationSettingsData {
  enabled: boolean;
  slots: [
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
    { enabled: boolean; hour: number; minute: number },
  ];
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettingsData>({
    enabled: true,
    slots: [
      { enabled: true, hour: 9, minute: 0 },
      { enabled: true, hour: 12, minute: 0 },
      { enabled: true, hour: 17, minute: 0 },
    ],
  });
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await window.electronAPI.notification.getScheduledSettings();
      setSettings(data as NotificationSettingsData);
    } catch (error) {
      console.error('Failed to load scheduled notification settings:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.notification.setScheduledSettings(settings);
    } catch (error) {
      console.error('Failed to save scheduled notification settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setTestSending(true);
    try {
      await window.electronAPI.notification.sendTestNotification();
    } catch (error) {
      console.error('Failed to send test notification:', error);
    } finally {
      setTestSending(false);
    }
  };

  const updateSlot = (index: number, field: 'enabled' | 'hour' | 'minute', value: boolean | number) => {
    const newSlots = [...settings.slots] as NotificationSettingsData['slots'];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSettings({ ...settings, slots: newSlots });
  };

  return (
    <div className="mb-6">
      <h4 className="text-sm font-semibold mb-2">
        Scheduled Notifications
      </h4>
      <p className="text-muted-foreground text-sm mb-4">
        Receive summary notifications at configured times.
      </p>

      <div className="mb-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          Enable scheduled notifications
        </label>
      </div>

      {settings.enabled && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">
            Time Slots:
          </p>
          {settings.slots.map((slot, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(e) => updateSlot(index, 'enabled', e.target.checked)}
              />
              <input
                type="number"
                min="0"
                max="23"
                value={slot.hour}
                onChange={(e) => updateSlot(index, 'hour', parseInt(e.target.value))}
                className="w-16 border rounded px-2 py-1"
              />
              <span>:</span>
              <input
                type="number"
                min="0"
                max="59"
                value={slot.minute}
                onChange={(e) => updateSlot(index, 'minute', parseInt(e.target.value))}
                className="w-16 border rounded px-2 py-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleTestNotification}
          disabled={testSending}
          className="px-4 py-2 text-sm border rounded"
        >
          {testSending ? 'Sending...' : 'Test Notification'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm border rounded"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
