import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockElectronAPI = {
  n8n: {
    dockerStatus: vi.fn().mockResolvedValue({ available: true }),
    status: vi.fn().mockResolvedValue({ status: 'healthy' }),
    start: vi.fn().mockResolvedValue(undefined),
  },
  onboarding: {
    getStatus: vi.fn().mockResolvedValue({
      dockerCheckComplete: false,
      n8nHealthComplete: false,
      apiKeyComplete: false,
      accountConnected: false,
      setupCompletedAt: null,
    }),
    setStepComplete: vi.fn().mockResolvedValue(undefined),
    recordSetupEvent: vi.fn().mockResolvedValue(undefined),
    startTracking: vi.fn().mockResolvedValue(undefined),
  },
  apikey: {
    save: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn().mockResolvedValue({ valid: true }),
  },
  gmail: {
    connect: vi.fn().mockResolvedValue(undefined),
  },
  telemetry: {
    getSettings: vi.fn().mockResolvedValue({ optedIn: false, consentedAt: null }),
    setOptIn: vi.fn().mockResolvedValue(undefined),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).window = { electronAPI: mockElectronAPI };
});

describe('StepIndicator', () => {
  it('exports a StepIndicator component', async () => {
    const mod = await import('../../src/components/SetupWizard/StepIndicator');
    expect(mod.StepIndicator).toBeDefined();
    expect(typeof mod.StepIndicator).toBe('function');
  });

  it('renders without throwing for valid props', async () => {
    const { StepIndicator } = await import('../../src/components/SetupWizard/StepIndicator');
    const steps = [
      { id: 'docker-check', title: 'Docker Check', status: 'completed' as const },
      { id: 'n8n-health', title: 'n8n Health', status: 'active' as const },
      { id: 'api-key', title: 'API Key', status: 'pending' as const },
    ];
    expect(() => StepIndicator({ steps, currentStepIndex: 1 })).not.toThrow();
  });
});

describe('DockerCheckStep', () => {
  it('exports a DockerCheckStep component', async () => {
    const mod = await import('../../src/components/SetupWizard/DockerCheckStep');
    expect(mod.DockerCheckStep).toBeDefined();
    expect(typeof mod.DockerCheckStep).toBe('function');
  });
});

describe('N8nHealthStep', () => {
  it('exports an N8nHealthStep component', async () => {
    const mod = await import('../../src/components/SetupWizard/N8nHealthStep');
    expect(mod.N8nHealthStep).toBeDefined();
    expect(typeof mod.N8nHealthStep).toBe('function');
  });
});

describe('ApiKeyStep', () => {
  it('exports an ApiKeyStep component', async () => {
    const mod = await import('../../src/components/SetupWizard/ApiKeyStep');
    expect(mod.ApiKeyStep).toBeDefined();
    expect(typeof mod.ApiKeyStep).toBe('function');
  });
});

describe('AccountConnectStep', () => {
  it('exports an AccountConnectStep component', async () => {
    const mod = await import('../../src/components/SetupWizard/AccountConnectStep');
    expect(mod.AccountConnectStep).toBeDefined();
    expect(typeof mod.AccountConnectStep).toBe('function');
  });
});

describe('SetupCompleteStep', () => {
  it('exports a SetupCompleteStep component', async () => {
    const mod = await import('../../src/components/SetupWizard/SetupCompleteStep');
    expect(mod.SetupCompleteStep).toBeDefined();
    expect(typeof mod.SetupCompleteStep).toBe('function');
  });
});

describe('SetupWizard', () => {
  it('exports a SetupWizard component', async () => {
    const mod = await import('../../src/components/SetupWizard/SetupWizard');
    expect(mod.SetupWizard).toBeDefined();
    expect(typeof mod.SetupWizard).toBe('function');
  });
});

describe('SetupWizard index', () => {
  it('exports all wizard components', async () => {
    const mod = await import('../../src/components/SetupWizard');
    expect(mod.StepIndicator).toBeDefined();
    expect(mod.DockerCheckStep).toBeDefined();
    expect(mod.N8nHealthStep).toBeDefined();
    expect(mod.ApiKeyStep).toBeDefined();
    expect(mod.AccountConnectStep).toBeDefined();
    expect(mod.SetupCompleteStep).toBeDefined();
    expect(mod.SetupWizard).toBeDefined();
  });
});

describe('Onboarding', () => {
  it('exports an Onboarding component', async () => {
    const mod = await import('../../src/components/Onboarding');
    expect(mod.Onboarding).toBeDefined();
    expect(typeof mod.Onboarding).toBe('function');
  });
});
