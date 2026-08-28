import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import selfsigned from 'selfsigned';

export interface CertPair {
  cert: string;
  key: string;
}

export interface SelfSignedOptions {
  commonName?: string;
  organization?: string;
  altNames?: string[];
  validityDays?: number;
}

const DEFAULT_OPTIONS: Required<SelfSignedOptions> = {
  commonName: 'Focus Board',
  organization: 'LAN Dashboard',
  altNames: ['localhost', '127.0.0.1', '*'],
  validityDays: 3650,
};

async function buildSelfSignedCertPair(options: Required<SelfSignedOptions>): Promise<CertPair> {
  const attrs = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: options.organization },
  ];

  const altNames = options.altNames.map((name) => ({ type: 2, value: name }));

  const pems = await selfsigned.generate(attrs, {
    days: options.validityDays,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'subjectAltName', altNames },
    ],
  });

  return { cert: pems.cert, key: pems.private };
}

export async function getOrCreateCerts(userDataPath: string): Promise<CertPair> {
  const certsDir = join(userDataPath, 'certs');
  const certPath = join(certsDir, 'server.crt');
  const keyPath = join(certsDir, 'server.key');

  if (existsSync(certPath) && existsSync(keyPath)) {
    return {
      cert: readFileSync(certPath, 'utf8'),
      key: readFileSync(keyPath, 'utf8'),
    };
  }

  const pair = await buildSelfSignedCertPair(DEFAULT_OPTIONS);

  mkdirSync(certsDir, { recursive: true });
  writeFileSync(certPath, pair.cert);
  writeFileSync(keyPath, pair.key);

  return pair;
}
