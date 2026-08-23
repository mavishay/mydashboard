import { execFile } from 'child_process';
import { promisify } from 'util';
import { which } from './utils';

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = 'docker-compose.yml';
const SERVICE_NAME = 'n8n';

async function getComposeCommand(): Promise<string> {
  const v2 = await which('docker');
  if (v2) return 'docker';
  const v1 = await which('docker-compose');
  if (v1) return 'docker-compose';
  throw new Error('Neither "docker" nor "docker-compose" found in PATH');
}

export async function composeUp(composeDir: string): Promise<void> {
  const cmd = await getComposeCommand();
  const args = cmd === 'docker'
    ? ['compose', '-f', COMPOSE_FILE, 'up', '-d', SERVICE_NAME]
    : ['-f', COMPOSE_FILE, 'up', '-d', SERVICE_NAME];
  await execFileAsync(cmd, args, { cwd: composeDir });
}

export async function composeDown(composeDir: string): Promise<void> {
  const cmd = await getComposeCommand();
  const args = cmd === 'docker'
    ? ['compose', '-f', COMPOSE_FILE, 'down', '--remove-orphans']
    : ['-f', COMPOSE_FILE, 'down', '--remove-orphans'];
  await execFileAsync(cmd, args, { cwd: composeDir });
}

export async function composeStatus(composeDir: string): Promise<string> {
  const cmd = await getComposeCommand();
  const args = cmd === 'docker'
    ? ['compose', '-f', COMPOSE_FILE, 'ps', SERVICE_NAME]
    : ['-f', COMPOSE_FILE, 'ps', SERVICE_NAME];
  const { stdout } = await execFileAsync(cmd, args, { cwd: composeDir });
  return stdout;
}
