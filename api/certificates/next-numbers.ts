import {
  getDatabaseCertificates,
  getReservedNumbers,
  generateUniqueRandomCertNumber,
  generateUniqueRandomScrapNumber,
} from '../_db.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
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
  } catch (err: any) {
    console.error('[NEXT-NUMBERS] Error generating numbers:', err);
    return res.status(500).json({
      message: 'Failed to allocate numbers',
      error: err?.message || String(err),
    });
  }
}
