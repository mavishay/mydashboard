import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [cmd]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
