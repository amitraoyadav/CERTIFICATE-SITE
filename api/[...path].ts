import { handleApiRequest } from './_handlers.ts';

/**
 * Vercel Serverless Function Catch-All Entry Point (/api/[...path]).
 * Dispatches all dynamic sub-paths through the consolidated router.
 */
export default async function handler(req: any, res: any) {
  return handleApiRequest(req, res);
}
