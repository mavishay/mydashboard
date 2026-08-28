import { useState, useEffect, useCallback } from 'react';

export function DndToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.notification.getDndStatus();
      setEnabled(result.enabled);
    } catch (err) {
      console.error('Failed to load DND status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = async () => {
    try {
      await window.electronAPI.notification.setDnd({ enabled: !enabled });
      setEnabled(!enabled);
    } catch (err) {
      console.error('Failed to toggle DND:', err);
    }
  };

  if (loading) {
    return <p style={{ color: '#999', fontSize: '0.875rem' }}>Loading...</p>;
  }

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={handleToggle}
        style={{ width: '1.25rem', height: '1.25rem' }}
      />
      <span style={{ fontSize: '0.875rem' }}>
        {enabled ? 'Do Not Disturb enabled' : 'Do Not Disturb disabled'}
      </span>
    </label>
  );
}
