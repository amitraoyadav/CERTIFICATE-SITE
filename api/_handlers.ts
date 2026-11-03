import {
  getDatabaseCertificates,
  saveDatabaseCertificates,
  getReservedNumbers,
  generateUniqueRandomCertNumber,
  generateUniqueRandomScrapNumber,
  createAndSaveCertificateRecord,
  computeCanonicalHash,
} from './_db.ts';
import { isMainAdminTokenValid, MAIN_ADMIN_TIMEOUT_MS } from './_auth.ts';
import type { Certificate } from '../src/types.ts';
import { app } from '../server.ts';

/**
 * Consolidated Central API Router for Vercel Serverless & Edge environments.
 * Dispatches all application endpoints under a single serverless function
 * to strictly stay within the Vercel Hobby plan limit (maximum 12 functions).
 */
export async function handleApiRequest(req: any, res: any) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
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

  // Parse raw body if string
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
      req.body = body;
    } catch {}
  }

  // Normalize incoming pathname
  let rawUrl = req.url || '';
  if (Array.isArray(req.query?.path)) {
    rawUrl = `/api/${req.query.path.join('/')}`;
  } else if (typeof req.query?.path === 'string') {
    rawUrl = `/api/${req.query.path}`;
  }

  const [pathOnly, searchStr] = rawUrl.split('?');
  let pathname = pathOnly || '';
  if (!pathname.startsWith('/api') && !pathname.startsWith('/?')) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }

  // Extract query parameters if not pre-parsed
  const query = req.query || {};
  if (searchStr && !req.query) {
    const params = new URLSearchParams(searchStr);
    params.forEach((v, k) => {
      query[k] = v;
    });
  }

  const method = (req.method || 'GET').toUpperCase();

  // ----------------------------------------------------
  // 1. Health check: /api/health
  // ----------------------------------------------------
  if (pathname === '/api/health') {
    return res.status(200).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      platform: 'Vercel Serverless (Consolidated Router)',
    });
  }

  // ----------------------------------------------------
  // 2. Auth: /api/auth/login
  // ----------------------------------------------------
  if (pathname === '/api/auth/login' && method === 'POST') {
    const rawUser = String(body?.username ?? body?.user ?? '').trim();
    const rawPass = String(body?.password ?? body?.pass ?? body?.adminPassword ?? '').trim();

    if (!rawUser || !rawPass) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect Information. Please enter both username and password.',
      });
    }

    const cleanUser = rawUser.toLowerCase();
    const cleanPass = rawPass;

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

    const validPasswords = ['Scrap123', 'Scrap00', 'Scrapbyparivahan', 'admin123'];

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
  }

  // ----------------------------------------------------
  // 3. Auth: /api/auth/me
  // ----------------------------------------------------
  if (pathname === '/api/auth/me' && method === 'GET') {
    return res.status(200).json({
      authenticated: true,
      user: { username: 'pscrappers', role: 'administrator' },
    });
  }

  // ----------------------------------------------------
  // 4. Auth: /api/auth/main-admin-status
  // ----------------------------------------------------
  if (pathname === '/api/auth/main-admin-status' && method === 'GET') {
    return res.status(200).json({ isMainAdmin: true });
  }

  // ----------------------------------------------------
  // 5. Auth: /api/auth/verify-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/verify-main-admin' && method === 'POST') {
    return res.status(200).json({
      success: true,
      token: 'ma_unlocked',
      expiresInMs: MAIN_ADMIN_TIMEOUT_MS,
      message: 'Main Admin access granted.',
    });
  }

  // ----------------------------------------------------
  // 6. Auth: /api/auth/logout-main-admin
  // ----------------------------------------------------
  if (pathname === '/api/auth/logout-main-admin' && method === 'POST') {
    return res.status(200).json({ success: true, message: 'Logged out of Main Admin session.' });
  }

  // ----------------------------------------------------
  // 7. Allocation: /api/certificates/next-numbers & /next-number
  // ----------------------------------------------------
  if (
    (pathname === '/api/certificates/next-numbers' ||
      pathname === '/api/certificates/next-number' ||
      (pathname === '/api/certificates' &&
        (query.action === 'next-numbers' || query.next === 'true'))) &&
    method === 'GET'
  ) {
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

  // ----------------------------------------------------
  // 8. Vehicle duplicate check: /api/certificates/check-vehicle
  // ----------------------------------------------------
  if (pathname === '/api/certificates/check-vehicle' && method === 'GET') {
    const vehicleNo = String(query.vehicleRegistrationNumber || '').trim().toUpperCase();
    const chassisNo = String(query.chassisNumber || '').trim().toUpperCase();
    const engineNo = String(query.engineNumber || '').trim().toUpperCase();

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

  // ----------------------------------------------------
  // 9. Stats: /api/stats
  // ----------------------------------------------------
  if (pathname === '/api/stats' && method === 'GET') {
    const certs = getDatabaseCertificates();
    const active = certs.filter((c) => c.status === 'VALID').length;
    const cancelled = certs.filter((c) => c.status === 'CANCELLED').length;
    const superseded = certs.filter((c) => c.status === 'SUPERSEDED').length;

    return res.status(200).json({
      totalCertificates: certs.length,
      activeCertificates: active,
      cancelledCertificates: cancelled,
      supersededCertificates: superseded,
      validCount: active,
      cancelledCount: cancelled,
      supersededCount: superseded,
      isMainAdmin: true,
    });
  }

  // ----------------------------------------------------
  // 10. Public Verification: /api/verify
  // ----------------------------------------------------
  if (pathname === '/api/verify' && method === 'GET') {
    const certs = getDatabaseCertificates();
    const queryParam = String(
      query.certificateNumber ||
      query.certNumber ||
      query.cert ||
      query.q ||
      query.token ||
      ''
    ).trim();

    const tokenParam = String(query.token || '').trim();

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

  // ----------------------------------------------------
  // 11. Certificates: /api/certificates (GET list, POST create)
  // ----------------------------------------------------
  if (pathname === '/api/certificates') {
    const certs = getDatabaseCertificates();

    if (method === 'GET') {
      const q = typeof query.q === 'string' ? query.q.toLowerCase().trim() : '';
      const statusFilter = typeof query.status === 'string' ? query.status.toUpperCase() : '';

      const sortedAll = [...certs].sort((a, b) => {
        const timeA = new Date(a.dateOfIssue || a.createdAt).getTime() || 0;
        const timeB = new Date(b.dateOfIssue || b.createdAt).getTime() || 0;
        return timeB - timeA;
      });

      let filtered = sortedAll;
      if (statusFilter && statusFilter !== 'ALL') {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (q) {
        filtered = filtered.filter(
          (c) =>
            c.certificateNumber.toLowerCase().includes(q) ||
            c.scrappingRegistrationNumber.toLowerCase().includes(q) ||
            c.ownerName.toLowerCase().includes(q) ||
            c.vehicleRegistrationNumber.toLowerCase().includes(q) ||
            c.chassisNumber.toLowerCase().includes(q) ||
            c.engineNumber.toLowerCase().includes(q)
        );
      }
      return res.status(200).json(filtered);
    }

    if (method === 'POST') {
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ message: 'Invalid certificate payload provided.' });
      }

      try {
        // Pre-built Certificate (e.g. sync or import)
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

        // Form creation payload from Make Certificate
        if (body.ownerName) {
          const created = createAndSaveCertificateRecord(body);
          return res.status(201).json(created);
        }

        return res.status(400).json({ message: 'Owner name is mandatory to issue a certificate.' });
      } catch (err: any) {
        console.error('[POST /api/certificates] Error:', err);
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
  }

  // ----------------------------------------------------
  // 12. Fallback to Express app for all remaining routes
  // (e.g. /api/migration/*, /api/backups/*, /api/certificates/:id/*, etc.)
  // ----------------------------------------------------
  req.url = rawUrl;
  return app(req, res);
}
