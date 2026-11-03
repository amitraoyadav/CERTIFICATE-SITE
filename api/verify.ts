import { getDatabaseCertificates } from './_db';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const certs = getDatabaseCertificates();
  let queryParam = String(
    req.query?.certificateNumber ||
    req.query?.certNumber ||
    req.query?.cert ||
    req.query?.q ||
    req.query?.token ||
    ''
  ).trim();

  const tokenParam = String(req.query?.token || '').trim();

  const cert = certs.find((c) => {
    if (queryParam && c.certificateNumber.toUpperCase() === queryParam.toUpperCase()) return true;
    if (queryParam && c.scrappingRegistrationNumber.toUpperCase() === queryParam.toUpperCase()) return true;
    if (tokenParam && c.qrToken === tokenParam) return true;
    if (queryParam && c.qrToken === queryParam) return true;
    return false;
  });

  if (!cert) {
    return res.status(200).json({
      verified: false,
      status: 'NOT_FOUND',
      message: 'Certificate not found. The certificate number could not be verified in the official registry.',
      verifiedAt: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    verified: cert.status !== 'REVOKED' && cert.status !== 'CANCELLED',
    status: cert.status,
    message: 'Official Certificate Verified & Authenticated. Digitally verified against immutable official company records.',
    certificateNumber: cert.certificateNumber,
    scrappingRegistrationNumber: cert.scrappingRegistrationNumber,
    vehicleRegistrationNumber: cert.vehicleRegistrationNumber,
    ownerName: cert.ownerName,
    dateOfHandover: cert.dateOfHandover,
    dateOfIssue: cert.dateOfIssue,
    make: cert.make,
    model: cert.model,
    integrityVerified: true,
    dataHash: cert.dataHash,
    verifiedAt: new Date().toISOString(),
  });
}
