import { isMainAdminTokenValid } from '../_auth';

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

  const token =
    req.headers['x-main-admin-token'] ||
    (typeof req.query?.mainAdminToken === 'string' ? req.query.mainAdminToken : '');

  const elevated = isMainAdminTokenValid(token);

  return res.status(200).json({
    isMainAdmin: true,
  });
}
