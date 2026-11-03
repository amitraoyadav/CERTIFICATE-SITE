import type { Request, Response } from 'express';
import { app } from '../server';

/**
 * Vercel Serverless Function Handler
 * Proxies incoming serverless requests to the shared, unified Express application.
 * Ensures consistent handling for:
 *  - Main Admin authentication (/api/auth/verify-main-admin) with password 'Scrapbyparivahan'
 *  - Full 920 certificates registry (/api/certificates)
 *  - Public verification engine (/api/verify)
 *  - Migration archives download (/api/migration/download/:filename)
 *  - Settings and sequential numbering systems
 */
export default function handler(req: Request, res: Response) {
  // Normalize url if Vercel routes without leading /api
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/?')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }

  return app(req, res);
}
