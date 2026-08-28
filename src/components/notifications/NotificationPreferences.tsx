import { QuietHoursSettings } from './QuietHoursSettings';
import { DndToggle } from './DndToggle';

export function NotificationPreferences() {
  return (
    <div>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Notifications</h3>
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Configure how you receive notifications for urgent emails.
      </p>

      <div style={{ marginBottom: '1.5rem' }}>
        <DndToggle />
      </div>

      <div>
        <QuietHoursSettings />
      </div>
    </div>
  );
}
