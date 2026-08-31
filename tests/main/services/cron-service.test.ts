import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CronService } from '../../../electron/main/services/cron-service';

function createMockScheduler() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
  };
}

describe('CronService', () => {
  let scheduler: ReturnType<typeof createMockScheduler>;
  let service: CronService;

  beforeEach(() => {
    scheduler = createMockScheduler();
    service = new CronService(scheduler as any);
  });

  it('has correct id and name', () => {
    expect(service.id).toBe('cron');
    expect(service.name).toBe('Email Auto-Fetch');
  });

  it('starts with stopped status', () => {
    expect(service.getStatus()).toBe('stopped');
    expect(service.getLastError()).toBeNull();
  });

  it('calls scheduler.start on start', async () => {
    await service.start();
    expect(scheduler.start).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toBe('running');
  });

  it('calls scheduler.stop on stop', () => {
    service.stop();
    expect(scheduler.stop).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toBe('stopped');
  });

  it('sets error status when start throws', async () => {
    scheduler.start.mockImplementation(() => { throw new Error('start failed'); });
    
    await expect(service.start()).rejects.toThrow('start failed');
    expect(service.getStatus()).toBe('error');
    expect(service.getLastError()).toBe('start failed');
  });

  it('resets error on successful start after previous failure', async () => {
    scheduler.start.mockImplementationOnce(() => { throw new Error('fail'); });
    await expect(service.start()).rejects.toThrow();
    expect(service.getStatus()).toBe('error');
    expect(service.getLastError()).toBe('fail');

    scheduler.start.mockReset();
    await service.start();
    expect(service.getStatus()).toBe('running');
  });
});
