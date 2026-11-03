import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type {
  Certificate,
  SystemSettings,
  DashboardStats,
  AuditLogEntry,
  DatabaseBackupInfo,
  DriveSyncLog,
  CompanySnapshot,
} from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'parivahan-data');

const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');
const BACKUP_CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates_backup.json');
const MASTER_REGISTRY_FILE = path.join(DATA_DIR, 'MASTER_AUTHORITATIVE_REGISTRY.json');
const ALL_920_FILE = path.join(DATA_DIR, 'ALL_920_CERTIFICATES.json');
const EMBEDDED_BASELINE_FILE = path.join(process.cwd(), 'src/data/authoritativePreservedCertificates.json');
const RESERVED_NUMBERS_FILE = path.join(DATA_DIR, 'reserved_numbers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_logs.json');
const AUDIT_BACKUP_FILE = path.join(DATA_DIR, 'audit_logs_backup.json');
const DRIVE_SYNC_LOGS_FILE = path.join(DATA_DIR, 'drive_sync_logs.json');
const DATABASE_BACKUPS_DIR = path.join(DATA_DIR, 'database_backups');

// Temporary serverless scratch files (/tmp is writable in Vercel Lambdas)
const TMP_CERTIFICATES_FILE = path.join(TMP_DATA_DIR, 'certificates.json');
const TMP_RESERVED_FILE = path.join(TMP_DATA_DIR, 'reserved_numbers.json');
const TMP_SETTINGS_FILE = path.join(TMP_DATA_DIR, 'settings.json');
const TMP_AUDIT_FILE = path.join(TMP_DATA_DIR, 'audit_logs.json');

// Ensure required directories exist safely in both primary and /tmp
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {}
try {
  if (!fs.existsSync(DATABASE_BACKUPS_DIR)) fs.mkdirSync(DATABASE_BACKUPS_DIR, { recursive: true });
} catch {}
try {
  if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
} catch {}

// Default System Settings
export const DEFAULT_SETTINGS: SystemSettings = {
  companyName: 'PARIVAHAN SCRAPPERS',
  companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
  address: 'B12, Dwarka, New Delhi.',
  phone: '8506925495',
  website: 'https://parivahan-scrappers.netlify.app/',
  signatoryTitle: 'Authorised Signatory',
  certificatePrefix: 'PS/26/R',
  certificateNextSeq: 1011,
  scrappingPrefix: 'REG-C',
  scrappingNextSeq: 272840,
  warnDuplicateVehicle: true,
  adminUsername: 'pscrappers',
  adminPasswordHash: 'Scrap123',
};

// Concurrency Mutex for transactional certificate creation & numbering
class CreationMutex {
  private queue = Promise.resolve();
  acquire(): Promise<() => void> {
    let release: () => void = () => {};
    const p = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = this.queue.then(() => release);
    this.queue = this.queue.then(() => p);
    return current;
  }
}
export const certCreationMutex = new CreationMutex();

// In-memory cache to ensure speed and state preservation across requests
let inMemoryCertificates: Certificate[] | null = null;
let inMemorySettings: SystemSettings | null = null;
let inMemoryReservedNumbers: { certificateNumbers: string[]; scrappingNumbers: string[] } | null = null;
let inMemoryAuditLogs: AuditLogEntry[] | null = null;

/**
 * Deduplicate certificates by normalized certificate number, preserving rich data & aliases
 */
export function deduplicateCertificates(list: Certificate[]): Certificate[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, Certificate>();

  for (const item of list) {
    if (!item) continue;
    const certNo = String(item.certificateNumber || '').trim().toUpperCase();
    if (!certNo || certNo === 'PS/26/R' || certNo === 'UNDEFINED' || certNo === 'NULL') {
      continue;
    }

    const cleanItem = { ...item };
    const existing = map.get(certNo);
    if (!existing) {
      const base: Certificate = {
        ...cleanItem,
        certificateNumber: certNo,
        isLocked: true,
        isImmutable: true,
        version: cleanItem.version || 1,
        aliases: cleanItem.aliases ? Array.from(new Set([certNo, ...cleanItem.aliases])) : [certNo],
        issuedAt: cleanItem.issuedAt || cleanItem.createdAt || new Date().toISOString(),
        lockedAt: cleanItem.lockedAt || cleanItem.createdAt || new Date().toISOString(),
      };
      base.dataHash = cleanItem.dataHash || computeCanonicalHash(base);
      map.set(certNo, base);
    } else {
      const keep = { ...existing };
      if (!keep.vehicleRegistrationNumber || keep.vehicleRegistrationNumber === 'Not Provided') {
        keep.vehicleRegistrationNumber = cleanItem.vehicleRegistrationNumber || keep.vehicleRegistrationNumber;
      }
      if (!keep.chassisNumber || keep.chassisNumber === 'Not Provided') {
        keep.chassisNumber = cleanItem.chassisNumber || keep.chassisNumber;
      }
      if (!keep.engineNumber || keep.engineNumber === 'Not Provided') {
        keep.engineNumber = cleanItem.engineNumber || keep.engineNumber;
      }
      if (cleanItem.aliases) {
        keep.aliases = Array.from(new Set([...(keep.aliases || [certNo]), ...cleanItem.aliases, certNo]));
      }
      map.set(certNo, keep);
    }
  }

  return Array.from(map.values());
}

/**
 * Retrieve all certificates from storage with resilient multi-tier fallback
 */
export function getDatabaseCertificates(): Certificate[] {
  if (inMemoryCertificates && inMemoryCertificates.length > 0) {
    return inMemoryCertificates;
  }

  const allFoundCerts: Certificate[] = [];

  // 1. Try reading /tmp scratch CERTIFICATES_FILE (holds recent serverless writes)
  try {
    if (fs.existsSync(TMP_CERTIFICATES_FILE)) {
      const raw = fs.readFileSync(TMP_CERTIFICATES_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allFoundCerts.push(...parsed);
        }
      }
    }
  } catch {}

  // 2. Try reading primary CERTIFICATES_FILE
  try {
    if (fs.existsSync(CERTIFICATES_FILE)) {
      const raw = fs.readFileSync(CERTIFICATES_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allFoundCerts.push(...parsed);
        }
      }
    }
  } catch (err) {
    console.warn('[DB] Primary certificates read notice:', err);
  }

  // 3. Try MASTER_REGISTRY_FILE
  try {
    if (fs.existsSync(MASTER_REGISTRY_FILE)) {
      const raw = fs.readFileSync(MASTER_REGISTRY_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allFoundCerts.push(...parsed);
        }
      }
    }
  } catch {}

  // 4. Try ALL_920_FILE
  try {
    if (fs.existsSync(ALL_920_FILE)) {
      const raw = fs.readFileSync(ALL_920_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allFoundCerts.push(...parsed);
        }
      }
    }
  } catch {}

  // 5. Try bundled baseline in code repository
  try {
    if (fs.existsSync(EMBEDDED_BASELINE_FILE)) {
      const raw = fs.readFileSync(EMBEDDED_BASELINE_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allFoundCerts.push(...parsed);
        }
      }
    }
  } catch (baselineErr) {
    console.warn('[DB] Authoritative baseline read notice:', baselineErr);
  }

  if (allFoundCerts.length > 0) {
    inMemoryCertificates = deduplicateCertificates(allFoundCerts);
    return inMemoryCertificates;
  }

  inMemoryCertificates = [];
  return inMemoryCertificates;
}

/**
 * Persist certificates safely to in-memory cache, /tmp scratch storage, and filesystem
 */
export function saveDatabaseCertificates(certs: Certificate[]): void {
  const deduped = deduplicateCertificates(certs);
  inMemoryCertificates = deduped;

  const jsonStr = JSON.stringify(deduped, null, 2);

  // 1. Always write to /tmp scratch storage (guaranteed writable on Vercel)
  try {
    if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_CERTIFICATES_FILE, jsonStr, 'utf-8');
  } catch (tmpErr) {
    console.warn('[DB] /tmp scratch write notice:', tmpErr);
  }

  // 2. Attempt writing to persistent files if filesystem is writable
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CERTIFICATES_FILE, jsonStr, 'utf-8');

    try {
      fs.writeFileSync(BACKUP_CERTIFICATES_FILE, jsonStr, 'utf-8');
    } catch {}

    try {
      fs.writeFileSync(MASTER_REGISTRY_FILE, jsonStr, 'utf-8');
    } catch {}
  } catch (err) {
    console.warn('[DB] Persistent filesystem write notice (in-memory & /tmp scratch updated):', err);
  }
}

/**
 * Retrieve reserved serial numbers
 */
export function getReservedNumbers(): { certificateNumbers: string[]; scrappingNumbers: string[] } {
  if (inMemoryReservedNumbers) {
    return inMemoryReservedNumbers;
  }

  // Check /tmp scratch first
  try {
    if (fs.existsSync(TMP_RESERVED_FILE)) {
      const raw = fs.readFileSync(TMP_RESERVED_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        inMemoryReservedNumbers = {
          certificateNumbers: Array.isArray(parsed.certificateNumbers) ? parsed.certificateNumbers : [],
          scrappingNumbers: Array.isArray(parsed.scrappingNumbers) ? parsed.scrappingNumbers : [],
        };
        return inMemoryReservedNumbers;
      }
    }
  } catch {}

  // Check primary
  try {
    if (fs.existsSync(RESERVED_NUMBERS_FILE)) {
      const raw = fs.readFileSync(RESERVED_NUMBERS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        inMemoryReservedNumbers = {
          certificateNumbers: Array.isArray(parsed.certificateNumbers) ? parsed.certificateNumbers : [],
          scrappingNumbers: Array.isArray(parsed.scrappingNumbers) ? parsed.scrappingNumbers : [],
        };
        return inMemoryReservedNumbers;
      }
    }
  } catch {}

  inMemoryReservedNumbers = { certificateNumbers: [], scrappingNumbers: [] };
  return inMemoryReservedNumbers;
}

/**
 * Permanently reserve certificate & scrapping numbers
 */
export function reserveNumber(certNo?: string, scrapNo?: string): void {
  const current = getReservedNumbers();
  let modified = false;

  if (certNo && certNo.trim()) {
    const cleanCert = certNo.trim().toUpperCase();
    if (!current.certificateNumbers.some((n) => n.toUpperCase() === cleanCert)) {
      current.certificateNumbers.push(cleanCert);
      modified = true;
    }
  }

  if (scrapNo && scrapNo.trim()) {
    const cleanScrap = scrapNo.trim().toUpperCase();
    if (!current.scrappingNumbers.some((n) => n.toUpperCase() === cleanScrap)) {
      current.scrappingNumbers.push(cleanScrap);
      modified = true;
    }
  }

  if (modified) {
    inMemoryReservedNumbers = current;
    const jsonStr = JSON.stringify(current, null, 2);

    // Write to /tmp scratch
    try {
      if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
      fs.writeFileSync(TMP_RESERVED_FILE, jsonStr, 'utf-8');
    } catch {}

    // Write to primary
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(RESERVED_NUMBERS_FILE, jsonStr, 'utf-8');
    } catch (e) {
      console.warn('[DB] Reserved numbers write notice:', e);
    }
  }
}

/**
 * System Settings accessor
 */
export function getSettings(): SystemSettings {
  if (inMemorySettings) return inMemorySettings;

  try {
    if (fs.existsSync(TMP_SETTINGS_FILE)) {
      const raw = fs.readFileSync(TMP_SETTINGS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        inMemorySettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        return inMemorySettings;
      }
    }
  } catch {}

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        inMemorySettings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
        return inMemorySettings;
      }
    }
  } catch {}

  inMemorySettings = DEFAULT_SETTINGS;
  return inMemorySettings;
}

export function saveSettings(settings: SystemSettings): void {
  inMemorySettings = settings;
  const jsonStr = JSON.stringify(settings, null, 2);

  try {
    if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_SETTINGS_FILE, jsonStr, 'utf-8');
  } catch {}

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, jsonStr, 'utf-8');
  } catch (err) {
    console.warn('[DB] Settings write notice:', err);
  }
}

/**
 * Audit Logs accessor
 */
export function getAuditLogs(): AuditLogEntry[] {
  if (inMemoryAuditLogs) return inMemoryAuditLogs;

  try {
    if (fs.existsSync(TMP_AUDIT_FILE)) {
      const raw = fs.readFileSync(TMP_AUDIT_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryAuditLogs = parsed;
          return inMemoryAuditLogs;
        }
      }
    }
  } catch {}

  try {
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      const raw = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryAuditLogs = parsed;
          return inMemoryAuditLogs;
        }
      }
    }
  } catch {}

  inMemoryAuditLogs = [];
  return inMemoryAuditLogs;
}

export function recordAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  req?: any
): AuditLogEntry {
  const logs = getAuditLogs();
  const logItem: AuditLogEntry = {
    id: `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ...entry,
    ip: req ? (req.headers?.['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1' : entry.ip || '127.0.0.1',
    userAgent: req ? req.headers?.['user-agent'] || 'Unknown' : entry.userAgent || 'Unknown',
  };
  logs.unshift(logItem);
  if (logs.length > 500) logs.length = 500;
  inMemoryAuditLogs = logs;

  const jsonStr = JSON.stringify(logs, null, 2);

  try {
    if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true });
    fs.writeFileSync(TMP_AUDIT_FILE, jsonStr, 'utf-8');
  } catch {}

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUDIT_LOG_FILE, jsonStr, 'utf-8');
    try {
      fs.writeFileSync(AUDIT_BACKUP_FILE, jsonStr, 'utf-8');
    } catch {}
  } catch (e) {
    console.warn('[DB] Audit log write notice:', e);
  }
  return logItem;
}

/**
 * Cryptographically secure random alphanumeric string generator
 * Uses character set with high visual distinctiveness: 23456789ABCDEFGHJKLMNPQRSTUVWXYZ
 */
export function generateRandomCode(length = 6): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i] % chars.length];
  }
  return res;
}

/**
 * Generate guaranteed-unique certificate number: PS/26/R + 6 random uppercase alphanumeric chars
 */
export function generateUniqueRandomCertNumber(
  certs: Certificate[],
  reserved?: { certificateNumbers: string[] }
): string {
  const existingSet = new Set<string>();
  for (const c of certs) {
    if (c && c.certificateNumber) existingSet.add(c.certificateNumber.trim().toUpperCase());
    if (c && c.aliases) {
      for (const a of c.aliases) existingSet.add(a.trim().toUpperCase());
    }
  }
  if (reserved?.certificateNumbers) {
    for (const r of reserved.certificateNumbers) {
      if (r) existingSet.add(r.trim().toUpperCase());
    }
  }

  let attempts = 0;
  while (attempts < 5000) {
    const code = generateRandomCode(6);
    const candidate = `PS/26/R${code}`;
    if (!existingSet.has(candidate.toUpperCase())) {
      return candidate;
    }
    attempts++;
  }
  return `PS/26/R${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Generate guaranteed-unique scrap registration number: REG-C + 6 random uppercase alphanumeric chars
 */
export function generateUniqueRandomScrapNumber(
  certs: Certificate[],
  reserved?: { scrappingNumbers: string[] }
): string {
  const existingSet = new Set<string>();
  for (const c of certs) {
    if (c && c.scrappingRegistrationNumber) existingSet.add(c.scrappingRegistrationNumber.trim().toUpperCase());
  }
  if (reserved?.scrappingNumbers) {
    for (const r of reserved.scrappingNumbers) {
      if (r) existingSet.add(r.trim().toUpperCase());
    }
  }

  let attempts = 0;
  while (attempts < 5000) {
    const code = generateRandomCode(6);
    const candidate = `REG-C${code}`;
    if (!existingSet.has(candidate.toUpperCase())) {
      return candidate;
    }
    attempts++;
  }
  return `REG-C${Date.now().toString().slice(-6)}`;
}

/**
 * Deterministic cryptographic SHA-256 data integrity hash
 */
export function computeCanonicalHash(cert: {
  certificateNumber: string;
  scrappingRegistrationNumber: string;
  ownerName: string;
  address?: string;
  idProofNumber?: string;
  vehicleRegistrationNumber: string;
  chassisNumber: string;
  engineNumber: string;
  make: string;
  model: string;
  yearOfManufacture?: string;
  dateOfHandover: string;
  dateOfIssue: string;
}): string {
  const parts = [
    String(cert.certificateNumber || '').trim().toUpperCase(),
    String(cert.scrappingRegistrationNumber || '').trim().toUpperCase(),
    String(cert.ownerName || '').trim().toUpperCase(),
    String(cert.address || '').trim().toUpperCase(),
    String(cert.idProofNumber || '').trim().toUpperCase(),
    String(cert.vehicleRegistrationNumber || '').trim().toUpperCase(),
    String(cert.chassisNumber || '').trim().toUpperCase(),
    String(cert.engineNumber || '').trim().toUpperCase(),
    String(cert.make || '').trim().toUpperCase(),
    String(cert.model || '').trim().toUpperCase(),
    String(cert.yearOfManufacture || '').trim(),
    String(cert.dateOfHandover || '').trim(),
    String(cert.dateOfIssue || '').trim(),
  ];
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex');
}

/**
 * Creates and persists a certificate from raw creation payload with mutex safety & guaranteed uniqueness
 */
export function createAndSaveCertificateRecord(payload: any, req?: any): Certificate {
  const certs = getDatabaseCertificates();
  const reserved = getReservedNumbers();

  const ownerName = String(payload.ownerName || '').trim();
  if (!ownerName) {
    throw new Error('Owner Name is required to generate a certificate.');
  }

  const safeVehicleRC = payload.vehicleRegistrationNumber?.trim() || 'Not Provided';
  const safeChassis = payload.chassisNumber?.trim() || 'Not Provided';
  const safeEngine = payload.engineNumber?.trim() || 'Not Provided';
  const safeMake = payload.make?.trim() || 'Two Wheeler';
  const safeModel = payload.model?.trim() || 'Standard';

  // Check duplicate vehicle records unless forced
  if (!payload.forceDuplicate) {
    const activeCerts = certs.filter(
      (c) => c.status !== 'CANCELLED' && c.status !== 'SUPERSEDED' && c.status !== 'ARCHIVED'
    );
    let dupCert: Certificate | undefined;

    if (safeVehicleRC !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.vehicleRegistrationNumber && c.vehicleRegistrationNumber.trim().toUpperCase() === safeVehicleRC.toUpperCase()
      );
    }
    if (!dupCert && safeChassis !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.chassisNumber && c.chassisNumber.trim().toUpperCase() === safeChassis.toUpperCase()
      );
    }
    if (!dupCert && safeEngine !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.engineNumber && c.engineNumber.trim().toUpperCase() === safeEngine.toUpperCase()
      );
    }

    if (dupCert) {
      const err: any = new Error(`Certificate already exists for this vehicle. Certificate No: ${dupCert.certificateNumber}`);
      err.isDuplicateVehicle = true;
      err.existingCertificate = dupCert;
      throw err;
    }
  }

  // Allocate unique random numbers
  let candidateCertNo = '';
  if (
    payload.certificateNumber &&
    typeof payload.certificateNumber === 'string' &&
    payload.certificateNumber.trim() &&
    !payload.certificateNumber.includes('Loading') &&
    !payload.certificateNumber.includes('pending')
  ) {
    const reqCert = payload.certificateNumber.trim().toUpperCase();
    const isTaken =
      certs.some((c) => c.certificateNumber.toUpperCase() === reqCert || (c.aliases && c.aliases.map((a) => a.toUpperCase()).includes(reqCert))) ||
      reserved.certificateNumbers.some((n) => n.toUpperCase() === reqCert);

    if (!isTaken) {
      candidateCertNo = reqCert;
    }
  }
  if (!candidateCertNo) {
    candidateCertNo = generateUniqueRandomCertNumber(certs, reserved);
  }

  let candidateScrapNo = '';
  if (
    payload.scrappingRegistrationNumber &&
    typeof payload.scrappingRegistrationNumber === 'string' &&
    payload.scrappingRegistrationNumber.trim() &&
    !payload.scrappingRegistrationNumber.includes('Loading') &&
    !payload.scrappingRegistrationNumber.includes('pending')
  ) {
    const reqScrap = payload.scrappingRegistrationNumber.trim().toUpperCase();
    const isTaken =
      certs.some((c) => c.scrappingRegistrationNumber.toUpperCase() === reqScrap) ||
      reserved.scrappingNumbers.some((n) => n.toUpperCase() === reqScrap);

    if (!isTaken) {
      candidateScrapNo = reqScrap;
    }
  }
  if (!candidateScrapNo) {
    candidateScrapNo = generateUniqueRandomScrapNumber(certs, reserved);
  }

  // Ensure absolute uniqueness with loop
  while (
    certs.some((c) => c.certificateNumber.toUpperCase() === candidateCertNo.toUpperCase() || (c.aliases && c.aliases.map((a) => a.toUpperCase()).includes(candidateCertNo.toUpperCase()))) ||
    reserved.certificateNumbers.some((n) => n.toUpperCase() === candidateCertNo.toUpperCase())
  ) {
    candidateCertNo = generateUniqueRandomCertNumber(certs, reserved);
  }

  while (
    certs.some((c) => c.scrappingRegistrationNumber.toUpperCase() === candidateScrapNo.toUpperCase()) ||
    reserved.scrappingNumbers.some((n) => n.toUpperCase() === candidateScrapNo.toUpperCase()) ||
    candidateScrapNo.toUpperCase() === candidateCertNo.toUpperCase()
  ) {
    candidateScrapNo = generateUniqueRandomScrapNumber(certs, reserved);
  }

  // Atomically reserve both numbers
  reserveNumber(candidateCertNo, candidateScrapNo);

  const qrToken = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const verificationUrl = `/verify?certificateNumber=${encodeURIComponent(candidateCertNo)}&token=${qrToken}`;
  const now = new Date().toISOString();
  const internalId = `cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

  const settings = getSettings();
  const companySnapshot: CompanySnapshot = {
    companyName: settings.companyName,
    companySubtitle: settings.companySubtitle,
    address: settings.address,
    phone: settings.phone,
    website: settings.website,
    signatoryTitle: settings.signatoryTitle,
  };

  const newCertificate: Certificate = {
    id: internalId,
    certificateNumber: candidateCertNo,
    scrappingRegistrationNumber: candidateScrapNo,
    ownerName: ownerName.toUpperCase(),
    address: payload.address?.trim() || 'Not Provided',
    idProofNumber: payload.idProofNumber?.trim() || 'Not Provided',
    vehicleRegistrationNumber: safeVehicleRC.toUpperCase(),
    chassisNumber: safeChassis.toUpperCase(),
    engineNumber: safeEngine.toUpperCase(),
    showFullChassisEngine: payload.showFullChassisEngine === true || payload.showFullChassisEngine === 'true',
    make: safeMake,
    model: safeModel,
    location: 'Delhi NCR',
    yearOfManufacture: payload.yearOfManufacture?.trim() || new Date().getFullYear().toString(),
    dateOfHandover: payload.dateOfHandover || now.split('T')[0],
    dateOfIssue: payload.dateOfIssue || now.split('T')[0],
    qrToken,
    verificationUrl,
    status: 'VALID',
    isLocked: true,
    isImmutable: true,
    version: 1,
    issuedAt: now,
    lockedAt: now,
    createdBy: payload.createdBy || 'Administrator',
    companySnapshot,
    createdAt: now,
    updatedAt: now,
  };

  newCertificate.dataHash = computeCanonicalHash(newCertificate);

  // Prepend new certificate to database
  const updated = [newCertificate, ...certs];
  saveDatabaseCertificates(updated);

  // Record audit log
  recordAuditLog(
    {
      certificateId: newCertificate.id,
      certificateNumber: newCertificate.certificateNumber,
      action: 'CERTIFICATE_CREATED',
      actor: 'administrator',
      newStatus: 'VALID',
      dataHash: newCertificate.dataHash,
      details: `Official certificate ${newCertificate.certificateNumber} created for ${newCertificate.ownerName} with verified unique random allocation.`,
    },
    req
  );

  return newCertificate;
}
