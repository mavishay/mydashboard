import { describe, it, expect } from 'vitest';

describe('StatusBar', () => {
  it('exports a StatusBar component', async () => {
    const mod = await import('../../src/components/StatusBar');
    expect(mod.StatusBar).toBeDefined();
    expect(typeof mod.StatusBar).toBe('function');
  });
});

describe('ServiceStatusPanel', () => {
  it('exports a ServiceStatusPanel component', async () => {
    const mod = await import('../../src/components/ServiceStatusPanel');
    expect(mod.ServiceStatusPanel).toBeDefined();
    expect(typeof mod.ServiceStatusPanel).toBe('function');
  });
});
