import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';

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
  commonName: 'Unified Productivity Dashboard',
  organization: 'LAN Dashboard',
  altNames: ['localhost', '127.0.0.1', '*'],
  validityDays: 3650, // 10 years
};

// ASN.1 DER helpers
function derLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  if (len < 0x10000) return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.from([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function derPrimitive(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derConstructed(tag: number, items: Buffer[]): Buffer {
  const content = Buffer.concat(items);
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derSequence(items: Buffer[]): Buffer {
  return derConstructed(0x30, items);
}

function derSet(items: Buffer[]): Buffer {
  return derConstructed(0x31, items);
}

function derOid(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 0x80) {
      bytes.push(val);
    } else {
      const temp: number[] = [];
      while (val > 0) {
        temp.unshift(val & 0x7f);
        val >>>= 7;
      }
      for (let j = 0; j < temp.length - 1; j++) {
        bytes.push(temp[j] | 0x80);
      }
      bytes.push(temp[temp.length - 1]);
    }
  }
  return derPrimitive(0x06, Buffer.from(bytes));
}

function derInteger(value: Buffer): Buffer {
  if (value.length > 0 && (value[0] & 0x80)) {
    value = Buffer.concat([Buffer.from([0x00]), value]);
  }
  return derPrimitive(0x02, value);
}

function derBitString(value: Buffer): Buffer {
  return derPrimitive(0x03, Buffer.concat([Buffer.from([0x00]), value]));
}

function derUtf8String(value: string): Buffer {
  return derPrimitive(0x0c, Buffer.from(value, 'utf8'));
}

function derOctetString(value: Buffer): Buffer {
  return derPrimitive(0x04, value);
}

function derExplicit(tag: number, value: Buffer): Buffer {
  return derConstructed(0xa0 | tag, [value]);
}

function derUtcTime(date: Date): Buffer {
  const y = date.getUTCFullYear() % 100;
  const str = `${pad2(y)}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
  return derPrimitive(0x17, Buffer.from(str, 'ascii'));
}

function pad2(n: number): string {
  return n.toString(10).padStart(2, '0');
}

function derName(attrs: Array<[oid: string, value: string]>): Buffer {
  return derSequence(
    attrs.map(([oid, value]) =>
      derSet([derSequence([derOid(oid), derUtf8String(value)])])
    )
  );
}

function derExtensions(exts: Buffer[]): Buffer {
  return derExplicit(3, derSequence(exts));
}

function buildSelfSignedCertPair(options: Required<SelfSignedOptions>): CertPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const now = new Date();
  const notBefore = new Date(now.getTime() - 60_000);
  const notAfter = new Date(now.getTime() + options.validityDays * 24 * 60 * 60 * 1000);
  const serialNumber = randomBytes(16);

  // Subject and Issuer (self-signed: same)
  const name = derName([
    ['2.5.4.3', options.commonName], // CN
    ['2.5.4.10', options.organization], // O
  ]);

  // Validity
  const validity = derSequence([derUtcTime(notBefore), derUtcTime(notAfter)]);

  // SubjectPublicKeyInfo from PEM
  const spkiDer = Buffer.from(
    publicKey.replace(/-----.*?-----/g, '').replace(/\s/g, ''),
    'base64'
  );

  // Extensions
  const basicConstraints = derSequence([
    derOid('2.5.29.19'),
    derOctetString(
      derSequence([derExplicit(0, Buffer.from([0x01, 0x01, 0xff]))])
    ),
  ]);

  const keyUsage = derSequence([
    derOid('2.5.29.15'),
    derOctetString(
      derSequence([derExplicit(0, Buffer.from([0x03, 0x02, 0x07, 0x80]))])
    ),
  ]);

  const sanEntries: Buffer[] = [];
  for (const name of options.altNames) {
    const nameBytes = Buffer.from(name, 'ascii');
    sanEntries.push(Buffer.concat([Buffer.from([0x82, nameBytes.length]), nameBytes]));
  }

  const subjectAltName = derSequence([
    derOid('2.5.29.17'),
    derOctetString(derSequence(sanEntries)),
  ]);

  // TBS Certificate
  const tbsCertificate = derSequence([
    derExplicit(0, derInteger(Buffer.from([0x02]))), // version v3
    derInteger(serialNumber),
    derSequence([derOid('1.2.840.113549.1.1.11')]), // SHA256WithRSA
    name, // issuer
    validity,
    name, // subject
    derBitString(spkiDer),
    derExtensions([basicConstraints, keyUsage, subjectAltName]),
  ]);

  // Sign
  const sign = createSign('SHA256');
  sign.update(tbsCertificate);
  const signature = sign.sign(privateKey);

  // Full certificate
  const certDer = derSequence([
    tbsCertificate,
    derSequence([derOid('1.2.840.113549.1.1.11')]), // SHA256WithRSA
    derBitString(signature),
  ]);

  // Convert to PEM
  const base64 = certDer.toString('base64');
  const lines = base64.match(/.{1,64}/g) ?? [];
  const certPem = `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;

  return { cert: certPem, key: privateKey };
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

  const pair = buildSelfSignedCertPair(DEFAULT_OPTIONS);

  mkdirSync(certsDir, { recursive: true });
  writeFileSync(certPath, pair.cert);
  writeFileSync(keyPath, pair.key);

  return pair;
}
