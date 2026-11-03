export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {}
  }

  const rawUser = String(body?.username ?? body?.identifier ?? '').trim();
  const rawPass = String(body?.password ?? body?.pass ?? '').trim();

  if (!rawUser || !rawPass) {
    return res.status(400).json({
      success: false,
      message: 'Incorrect Information. Please enter both username and password.',
    });
  }

  if (
    (rawUser === 'pscrappers' || rawUser.toLowerCase() === 'admin') &&
    (rawPass === 'Scrap123' || rawPass === 'admin123' || rawPass === 'Scrapbyparivahan')
  ) {
    return res.status(200).json({
      success: true,
      token: 'ps_admin_session_token_secure_2026',
      message: 'Welcome back! Administrator login successful.',
    });
  }

  return res.status(401).json({
    success: false,
    message: 'Incorrect Information. Please check your username and password.',
  });
}
