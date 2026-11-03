export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-token, x-main-admin-token'
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    let body = req.body;

    // Handle stream body if not automatically parsed by runtime
    if (!body && typeof req.on === 'function') {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const rawText = Buffer.concat(chunks).toString('utf-8');
        if (rawText && rawText.trim()) {
          body = JSON.parse(rawText);
        }
      } catch (e) {
        console.warn('[AUTH] Stream parsing notice:', e);
      }
    } else if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const rawUser = String(
      body?.username ??
      body?.user ??
      body?.email ??
      body?.adminUsername ??
      body?.identifier ??
      ''
    ).trim();

    const rawPass = String(
      body?.password ??
      body?.pass ??
      body?.adminPassword ??
      ''
    ).trim();

    if (!rawUser || !rawPass) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect Information. Please enter both username and password.',
      });
    }

    const cleanUser = rawUser.toLowerCase();
    const cleanPass = rawPass;

    // Authorized administrator usernames
    const validUsers = [
      'pscrappers',
      'admin',
      'administrator',
      'parivahanscrappers',
      'parivahan-scrappers',
      'raoamityadavak123@gmail.com',
    ];

    const isUsernameValid =
      validUsers.includes(cleanUser) ||
      cleanUser.startsWith('pscrappers') ||
      cleanUser.startsWith('admin');

    // Authorized administrator passwords
    const validPasswords = [
      'Scrap123',
      'Scrap00',
      'Scrapbyparivahan',
      'admin123',
    ];

    const isPasswordValid = validPasswords.some(
      (vp) => cleanPass === vp || cleanPass.toLowerCase() === vp.toLowerCase()
    );

    if (isUsernameValid && isPasswordValid) {
      return res.status(200).json({
        success: true,
        token: 'ps_admin_session_token_secure_2026',
        user: {
          username: cleanUser,
          role: 'administrator',
        },
        message: 'Welcome back! Administrator login successful.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Incorrect Information. Please check your username and password.',
    });
  } catch (err: any) {
    console.error('[AUTH] Login handler error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal authentication server notice. Please retry.',
    });
  }
}
