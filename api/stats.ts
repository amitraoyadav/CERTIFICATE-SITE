import { getDatabaseCertificates } from './_db';
import { isMainAdminTokenValid } from './_auth';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const certs = getDatabaseCertificates();
  const active = certs.filter((c) => c.status === 'VALID').length;
  const cancelled = certs.filter((c) => c.status === 'CANCELLED').length;
  const superseded = certs.filter((c) => c.status === 'SUPERSEDED').length;

  return res.status(200).json({
    totalCertificates: certs.length,
    activeCertificates: active,
    cancelledCertificates: cancelled,
    supersededCertificates: superseded,
  });
}
