import { describe, it, expect } from 'vitest';

describe('StatusBar', () => {
  it('exports a StatusBar component', async () => {
    const mod = await import('../../src/components/StatusBar');
    expect(mod.StatusBar).toBeDefined();
    expect(typeof mod.StatusBar).toBe('function');
  });
});

describe('HealthCheckWizard', () => {
  it('exports a HealthCheckWizard component', async () => {
    const mod = await import('../../src/components/HealthCheckWizard');
    expect(mod.HealthCheckWizard).toBeDefined();
    expect(typeof mod.HealthCheckWizard).toBe('function');
  });
});

describe('StatusBar STATUS_CONFIG', () => {
  it('defines config for all 4 health states', async () => {
    const { StatusBar } = await import('../../src/components/StatusBar');
    const statuses = ['healthy', 'unhealthy', 'starting', 'unknown'];
    for (const s of statuses) {
      // Verify component can be called as pure function (no hooks)
      expect(() => StatusBar({ status: s, onClick: () => {} })).not.toThrow();
    }
  });

  it('handles unknown status gracefully', async () => {
    const { StatusBar } = await import('../../src/components/StatusBar');
    expect(() => StatusBar({ status: 'unexpected', onClick: () => {} })).not.toThrow();
  });
});

describe('HealthCheckWizard structure', () => {
  it('component is a valid React component', async () => {
    const { HealthCheckWizard } = await import('../../src/components/HealthCheckWizard');
    // Verify it's a function (component), not undefined or null
    expect(typeof HealthCheckWizard).toBe('function');
    expect(HealthCheckWizard.name).toBe('HealthCheckWizard');
  });
});
