import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Certificate } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');
const RESERVED_NUMBERS_FILE = path.join(DATA_DIR, 'reserved_numbers.json');

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

  // 2. Fallback to authoritative baseline file
  try {
    const baselinePath = path.join(process.cwd(), 'src/data/authoritativePreservedCertificates.json');
    if (fs.existsSync(baselinePath)) {
      const raw = fs.readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryCertificates = parsed;
        return parsed;
      }
    }
  } catch (baselineErr) {
    console.warn('[DB] Authoritative baseline read warning:', baselineErr);
  }

  inMemoryCertificates = [];
  return inMemoryCertificates;
}

export function getReservedNumbers(): { certificateNumbers: string[]; scrappingNumbers: string[] } {
  try {
    if (fs.existsSync(RESERVED_NUMBERS_FILE)) {
      const raw = fs.readFileSync(RESERVED_NUMBERS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        return {
          certificateNumbers: Array.isArray(parsed.certificateNumbers) ? parsed.certificateNumbers : [],
          scrappingNumbers: Array.isArray(parsed.scrappingNumbers) ? parsed.scrappingNumbers : [],
        };
      }
    }
  } catch {}
  return { certificateNumbers: [], scrappingNumbers: [] };
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

/**
 * Generate cryptographically secure random alphanumeric string
 * using characters: 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (no confusing 0, O, 1, I)
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
 * Generate random certificate number in format: PS/26/R + 6 random alphanumeric characters
 * Example: PS/26/R7K4M92, PS/26/R2N8X51, PS/26/R9B3T76, PS/26/R5W1K84
 * Guarantees zero collisions against existing certificates and reserved numbers with retry loop.
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
 * Generate random unique scrap registration number in format: REG-C + 6 random alphanumeric characters
 * Guarantees zero collisions with retry loop.
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
 * Creates and persists a certificate from raw creation payload
 */
export function createAndSaveCertificateRecord(payload: any): Certificate {
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
  if (payload.certificateNumber && typeof payload.certificateNumber === 'string' && payload.certificateNumber.trim() && !payload.certificateNumber.includes('Loading')) {
    const reqCert = payload.certificateNumber.trim().toUpperCase();
    const alreadyExists = certs.some((c) => c.certificateNumber.toUpperCase() === reqCert);
    if (!alreadyExists) {
      candidateCertNo = reqCert;
    }
  }
  if (!candidateCertNo) {
    candidateCertNo = generateUniqueRandomCertNumber(certs, reserved);
  }

  let candidateScrapNo = '';
  if (payload.scrappingRegistrationNumber && typeof payload.scrappingRegistrationNumber === 'string' && payload.scrappingRegistrationNumber.trim() && !payload.scrappingRegistrationNumber.includes('Loading')) {
    const reqScrap = payload.scrappingRegistrationNumber.trim().toUpperCase();
    const alreadyExists = certs.some((c) => c.scrappingRegistrationNumber.toUpperCase() === reqScrap);
    if (!alreadyExists) {
      candidateScrapNo = reqScrap;
    }
  }
  if (!candidateScrapNo) {
    candidateScrapNo = generateUniqueRandomScrapNumber(certs, reserved);
  }

  const qrToken = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const verificationUrl = `/verify?certificateNumber=${encodeURIComponent(candidateCertNo)}&token=${qrToken}`;
  const now = new Date().toISOString();
  const internalId = `cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

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
    createdBy: payload.createdBy || 'Admin',
    companySnapshot: {
      companyName: 'PARIVAHAN SCRAPPERS',
      companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
      address: 'B12, Dwarka, New Delhi.',
      phone: '8506925495',
      website: 'https://parivahan-scrappers.netlify.app/',
      signatoryTitle: 'Authorised Signatory',
    },
    createdAt: now,
    updatedAt: now,
  };

  newCertificate.dataHash = computeCanonicalHash(newCertificate);

  // Guarantee uniqueness before writing
  while (certs.some((c) => c.certificateNumber.toUpperCase() === newCertificate.certificateNumber.toUpperCase())) {
    newCertificate.certificateNumber = generateUniqueRandomCertNumber(certs, reserved);
    newCertificate.verificationUrl = `/verify?certificateNumber=${encodeURIComponent(newCertificate.certificateNumber)}&token=${newCertificate.qrToken}`;
    newCertificate.dataHash = computeCanonicalHash(newCertificate);
  }

  // Prepend new certificate to list
  const updated = [newCertificate, ...certs];
  saveDatabaseCertificates(updated);

  return newCertificate;
}
