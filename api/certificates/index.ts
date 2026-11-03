import {
  getDatabaseCertificates,
  saveDatabaseCertificates,
  getReservedNumbers,
  generateUniqueRandomCertNumber,
  generateUniqueRandomScrapNumber,
  createAndSaveCertificateRecord,
} from '../_db.ts';
import type { Certificate } from '../../src/types.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Disposition, Content-Type, x-admin-token, x-main-admin-token'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const isNextNumbers =
    url.includes('next-numbers') ||
    url.includes('next-number') ||
    req.query?.action === 'next-numbers' ||
    req.query?.next === 'true';

  // Intercept sub-routes if routed through /api/certificates
  if (isNextNumbers) {
    const certs = getDatabaseCertificates();
    const reserved = getReservedNumbers();
    const candidateCertNo = generateUniqueRandomCertNumber(certs, reserved);
    const candidateScrapNo = generateUniqueRandomScrapNumber(certs, reserved);
    return res.status(200).json({
      nextCertificateNumber: candidateCertNo,
      nextScrappingRegistrationNumber: candidateScrapNo,
      certificateNumber: candidateCertNo,
      scrappingRegistrationNumber: candidateScrapNo,
    });
  }

  const certs = getDatabaseCertificates();

  if (req.method === 'GET') {
    const query = typeof req.query?.q === 'string' ? req.query.q.toLowerCase().trim() : '';
    const statusFilter = typeof req.query?.status === 'string' ? req.query.status.toUpperCase() : '';

    // Sort newest first
    const sortedAll = [...certs].sort((a, b) => {
      const timeA = new Date(a.dateOfIssue || a.createdAt).getTime() || 0;
      const timeB = new Date(b.dateOfIssue || b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    let filtered = sortedAll;
    if (statusFilter && statusFilter !== 'ALL') {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }
    if (query) {
      filtered = filtered.filter(
        (c) =>
          c.certificateNumber.toLowerCase().includes(query) ||
          c.scrappingRegistrationNumber.toLowerCase().includes(query) ||
          c.ownerName.toLowerCase().includes(query) ||
          c.vehicleRegistrationNumber.toLowerCase().includes(query) ||
          c.chassisNumber.toLowerCase().includes(query) ||
          c.engineNumber.toLowerCase().includes(query)
      );
    }
    return res.status(200).json(filtered);
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ message: 'Invalid certificate payload provided.' });
    }

    try {
      // Case 1: Pre-constructed complete Certificate object (e.g., sync, bulk-import, or re-save)
      if (body.id && body.certificateNumber && body.qrToken) {
        const newCert = body as Certificate;
        const exists = certs.some(
          (c) => c.certificateNumber.toUpperCase() === newCert.certificateNumber.toUpperCase()
        );
        if (exists) {
          return res.status(409).json({
            message: `Certificate number ${newCert.certificateNumber} already exists in registry.`,
          });
        }
        const updated = [newCert, ...certs];
        saveDatabaseCertificates(updated);
        return res.status(201).json(newCert);
      }

      // Case 2: Creation payload from Make Certificate form
      // { ownerName, vehicleRegistrationNumber, chassisNumber, engineNumber, make, model, ... }
      if (body.ownerName) {
        const created = createAndSaveCertificateRecord(body);
        return res.status(201).json(created);
      }

      return res.status(400).json({ message: 'Owner name is mandatory to issue a certificate.' });
    } catch (err: any) {
      console.error('[POST /api/certificates] Error saving certificate:', err);
      if (err.isDuplicateVehicle) {
        return res.status(409).json({
          isDuplicateVehicle: true,
          message: err.message,
          existingCertificate: err.existingCertificate,
        });
      }
      return res.status(500).json({
        message: err.message || 'Failed to issue certificate on server database',
      });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}
