import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceRegistry, type ManagedService, type ServiceStatus } from '../../../electron/main/services/service-registry';

function createMockService(
  id: string,
  name: string,
  options?: {
    startFn?: () => Promise<void>;
    stopFn?: () => void;
    status?: ServiceStatus;
    lastError?: string | null;
    startedAt?: string | null;
  }
): ManagedService {
  let status: ServiceStatus = options?.status ?? 'stopped';
  const lastError: string | null = options?.lastError ?? null;
  let startedAt: string | null = options?.startedAt ?? null;

  return {
    id,
    name,
    start: options?.startFn ?? (async () => { status = 'running'; startedAt = new Date().toISOString(); }),
    stop: options?.stopFn ?? (() => { status = 'stopped'; startedAt = null; }),
    getStatus: () => status,
    getLastError: () => lastError,
    getStartedAt: () => startedAt,
  };
}

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  it('registers a service', () => {
    const service = createMockService('test', 'Test Service');
    registry.register(service);
    const statuses = registry.getStatus();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].id).toBe('test');
    expect(statuses[0].name).toBe('Test Service');
  });

  it('registers multiple services', () => {
    registry.register(createMockService('a', 'Service A'));
    registry.register(createMockService('b', 'Service B'));
    registry.register(createMockService('c', 'Service C'));
    expect(registry.getStatus()).toHaveLength(3);
  });

  it('startAll starts all services', async () => {
    const startFn = vi.fn(async () => {});
    registry.register(createMockService('test', 'Test', { startFn }));
    await registry.startAll();
    expect(startFn).toHaveBeenCalledTimes(1);
  });

  it('startAll continues even if one service fails', async () => {
    const successFn = vi.fn(async () => {});
    const failFn = vi.fn(async () => { throw new Error('fail'); });
    registry.register(createMockService('fail', 'Fail Service', { startFn: failFn }));
    registry.register(createMockService('success', 'Success Service', { startFn: successFn }));
    await registry.startAll();
    expect(failFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });

  it('stopAll stops all services', () => {
    const stopFn = vi.fn();
    registry.register(createMockService('test', 'Test', { stopFn }));
    registry.stopAll();
    expect(stopFn).toHaveBeenCalledTimes(1);
  });

  it('getStatus returns correct status for each service', async () => {
    const service = createMockService('test', 'Test');
    registry.register(service);
    
    expect(registry.getStatus()[0].status).toBe('stopped');
    
    await service.start();
    expect(registry.getStatus()[0].status).toBe('running');
  });

  it('getStatus includes lastError', () => {
    const service = createMockService('test', 'Test', { lastError: 'some error' });
    registry.register(service);
    expect(registry.getStatus()[0].lastError).toBe('some error');
  });

  it('getStatus includes null startedAt', () => {
    const service = createMockService('test', 'Test');
    registry.register(service);
    expect(registry.getStatus()[0].startedAt).toBeNull();
  });
});
