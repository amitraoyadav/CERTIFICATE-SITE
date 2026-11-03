import { getDatabaseCertificates, saveDatabaseCertificates } from './_db';
import type { Certificate } from '../src/types';

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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    const newCert = body as Certificate;
    if (!newCert || !newCert.certificateNumber) {
      return res.status(400).json({ message: 'Invalid certificate data provided.' });
    }

    // Ensure uniqueness
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

  return res.status(405).json({ message: 'Method Not Allowed' });
}
