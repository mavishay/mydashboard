import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = 'docker-compose.yml';
const SERVICE_NAME = 'n8n';

export async function composeUp(composeDir: string): Promise<void> {
  await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'up', '-d', SERVICE_NAME], {
    cwd: composeDir,
  });
}

export async function composeDown(composeDir: string): Promise<void> {
  await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'down', '--remove-orphans'], {
    cwd: composeDir,
  });
}

export async function composeStatus(composeDir: string): Promise<string> {
  const { stdout } = await execFileAsync('docker-compose', ['-f', COMPOSE_FILE, 'ps', SERVICE_NAME], {
    cwd: composeDir,
  });
  return stdout;
}
