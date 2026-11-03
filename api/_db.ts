import fs from 'fs';
import path from 'path';
import type { Certificate } from '../src/types';
import preservedBaseline from '../src/data/authoritativePreservedCertificates.json';

const DATA_DIR = path.join(process.cwd(), 'data');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');

let inMemoryCertificates: Certificate[] | null = null;

export function getDatabaseCertificates(): Certificate[] {
  if (inMemoryCertificates && inMemoryCertificates.length >= 934) {
    return inMemoryCertificates;
  }

  // 1. Try reading from filesystem if available
  try {
    if (fs.existsSync(CERTIFICATES_FILE)) {
      const raw = fs.readFileSync(CERTIFICATES_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 934) {
          inMemoryCertificates = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[DB] Filesystem read warning, falling back to embedded baseline:', err);
  }

  // 2. Use embedded synchronized authoritative baseline
  inMemoryCertificates = preservedBaseline as Certificate[];
  return inMemoryCertificates;
}

export function saveDatabaseCertificates(certs: Certificate[]): void {
  inMemoryCertificates = certs;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CERTIFICATES_FILE, JSON.stringify(certs, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB] Persistent filesystem write notice (in-memory updated):', err);
  }
}
