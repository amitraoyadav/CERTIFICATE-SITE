import https from 'https';
import http from 'http';
import { getDatabaseCertificates, saveDatabaseCertificates } from '../_db';
import type { Certificate } from '../../src/types';

function fetchFromLive(endpoint: string): Promise<any> {
  const liveBase = process.env.LIVE_DATABASE_URL || 'https://crm-parivahanscrappers.ai.studio';
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(endpoint, liveBase).toString();
    const client = targetUrl.startsWith('https') ? https : http;
    client
      .get(
        targetUrl,
        { headers: { 'User-Agent': 'ParivahanScrappers-VercelSync/2.0' } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data.slice(0, 150)}`));
            }
          });
        }
      )
      .on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const liveCerts = await fetchFromLive('/api/certificates');
    if (!Array.isArray(liveCerts) || liveCerts.length === 0) {
      return res.status(500).json({ success: false, message: 'Main Site returned empty list.' });
    }

    const currentLocal = getDatabaseCertificates();
    const localById = new Map<string, Certificate>();
    const localByNum = new Map<string, Certificate>();
    for (const c of currentLocal) {
      if (!c) continue;
      if (c.id) localById.set(c.id, c);
      if (c.certificateNumber) localByNum.set(c.certificateNumber.trim().toUpperCase(), c);
    }

    let matchedExisting = 0;
    let newImported = 0;
    const newlyImportedCerts: Certificate[] = [];

    const sortedLive = [...liveCerts].sort((a, b) => {
      const tA = new Date(a.dateOfIssue || a.createdAt).getTime() || 0;
      const tB = new Date(b.dateOfIssue || b.createdAt).getTime() || 0;
      return tB - tA;
    });

    for (const live of sortedLive) {
      if (!live || !live.certificateNumber) continue;
      const num = live.certificateNumber.trim().toUpperCase();

      if (live.id && localById.has(live.id)) {
        matchedExisting++;
      } else if (localByNum.has(num)) {
        // certificate number exists under another ID -> preserve
      } else {
        newlyImportedCerts.push(live);
        newImported++;
      }
    }

    const merged = [...newlyImportedCerts, ...currentLocal];
    if (newImported > 0) {
      saveDatabaseCertificates(merged);
    }

    return res.status(200).json({
      success: true,
      source: process.env.LIVE_DATABASE_URL || 'https://crm-parivahanscrappers.ai.studio',
      totalMainSite: liveCerts.length,
      totalDestinationBefore: currentLocal.length,
      newImported,
      matchedExisting,
      totalDestinationAfter: merged.length,
      existingRecordsModifiedOrDeleted: false,
      qrCodesAndVerificationLinksIntact: true,
      newImportedCertificates: newlyImportedCerts.map((c) => ({
        certificateNumber: c.certificateNumber,
        scrappingRegistrationNumber: c.scrappingRegistrationNumber,
        ownerName: c.ownerName,
        vehicleRegistrationNumber: c.vehicleRegistrationNumber,
        dateOfIssue: c.dateOfIssue,
        status: c.status,
      })),
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: 'Incremental sync failed: ' + err.message });
  }
}
