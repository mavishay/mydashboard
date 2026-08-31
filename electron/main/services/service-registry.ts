export type ServiceStatus = 'running' | 'stopped' | 'error' | 'starting';

export interface ServiceInfo {
  id: string;
  name: string;
  status: ServiceStatus;
  lastError: string | null;
  startedAt: string | null;
}

export interface ManagedService {
  id: string;
  name: string;
  start(): Promise<void>;
  stop(): void;
  getStatus(): ServiceStatus;
  getLastError(): string | null;
  getStartedAt(): string | null;
}

export class ServiceRegistry {
  private services = new Map<string, ManagedService>();

  register(service: ManagedService): void {
    this.services.set(service.id, service);
  }

  async startAll(): Promise<void> {
    for (const service of this.services.values()) {
      try {
        await service.start();
      } catch (err) {
        console.error(`[ServiceRegistry] Failed to start ${service.id}:`, err);
      }
    }
  }

  stopAll(): void {
    for (const service of this.services.values()) {
      service.stop();
    }
  }

  getStatus(): ServiceInfo[] {
    return Array.from(this.services.values()).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.getStatus(),
      lastError: s.getLastError(),
      startedAt: s.getStartedAt(),
    }));
  }
}
