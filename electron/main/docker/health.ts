import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'unknown';

const CONTAINER_NAME = 'productivity-dashboard-n8n';

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'inspect',
      '--format',
      '{{.State.Health.Status}}',
      CONTAINER_NAME,
    ]);
    return stdout.trim() as HealthStatus;
  } catch {
    return 'unknown';
  }
}

export function startHealthPoller(
  onStatusChange: (status: HealthStatus) => void,
  intervalMs: number = 30000
): NodeJS.Timeout {
  return setInterval(async () => {
    const status = await checkHealth();
    onStatusChange(status);
  }, intervalMs);
}
