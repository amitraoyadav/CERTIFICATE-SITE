import { getDatabaseCertificates } from '../_db.ts';
import type { Certificate } from '../../src/types.ts';

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

  const vehicleNo = String(req.query?.vehicleRegistrationNumber || '').trim().toUpperCase();
  const chassisNo = String(req.query?.chassisNumber || '').trim().toUpperCase();
  const engineNo = String(req.query?.engineNumber || '').trim().toUpperCase();

  if (!vehicleNo && !chassisNo && !engineNo) {
    return res.status(200).json({ exists: false });
  }

  const certs = getDatabaseCertificates();
  const activeCerts = certs.filter(
    (c) => c.status !== 'CANCELLED' && c.status !== 'SUPERSEDED' && c.status !== 'ARCHIVED'
  );

  let matched: Certificate | undefined;
  let matchField = '';
  let matchValue = '';

  if (vehicleNo && vehicleNo !== 'NOT PROVIDED') {
    matched = activeCerts.find(
      (c) => c.vehicleRegistrationNumber && c.vehicleRegistrationNumber.trim().toUpperCase() === vehicleNo
    );
    if (matched) {
      matchField = 'Vehicle Registration Number';
      matchValue = vehicleNo;
    }
  }

  if (!matched && chassisNo && chassisNo !== 'NOT PROVIDED') {
    matched = activeCerts.find(
      (c) => c.chassisNumber && c.chassisNumber.trim().toUpperCase() === chassisNo
    );
    if (matched) {
      matchField = 'Chassis Number';
      matchValue = chassisNo;
    }
  }

  if (!matched && engineNo && engineNo !== 'NOT PROVIDED') {
    matched = activeCerts.find(
      (c) => c.engineNumber && c.engineNumber.trim().toUpperCase() === engineNo
    );
    if (matched) {
      matchField = 'Engine Number';
      matchValue = engineNo;
    }
  }

  if (matched) {
    return res.status(200).json({
      exists: true,
      matchField,
      matchValue,
      certificateNumber: matched.certificateNumber,
      scrappingRegistrationNumber: matched.scrappingRegistrationNumber,
      ownerName: matched.ownerName,
      dateOfIssue: matched.dateOfIssue,
      certificateId: matched.id,
      vehicleRegistrationNumber: matched.vehicleRegistrationNumber,
      chassisNumber: matched.chassisNumber,
      engineNumber: matched.engineNumber,
      make: matched.make,
      model: matched.model,
    });
  }

  return res.status(200).json({ exists: false });
}
