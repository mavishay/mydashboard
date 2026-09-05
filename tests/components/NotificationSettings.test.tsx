import { describe, it, expect } from 'vitest';

describe('NotificationSettings', () => {
  it('exports NotificationSettings component', async () => {
    const mod = await import('../../src/components/NotificationSettings');
    expect(mod.NotificationSettings).toBeDefined();
    expect(typeof mod.NotificationSettings).toBe('function');
  });

  it('component is a valid React component', async () => {
    const { NotificationSettings } = await import('../../src/components/NotificationSettings');
    expect(typeof NotificationSettings).toBe('function');
    expect(NotificationSettings.name).toBe('NotificationSettings');
  });
});
